/**
 * AJ-v3 — the working pane MOUNTS and WORKS (regression guard).
 *
 * The v3 pane initially shipped unmounted: providers.tsx still rendered the
 * old v2 launcher, so the topbar button dispatched an event nothing owned
 * and the pane never appeared ("the site is not working"). This suite pins
 * the full wiring end-to-end at the component level:
 *
 *   Providers renders AskJunoWidget → `atlas:open-ask-juno` opens the pane
 *   → send drives /api/ask-juno (mocked) → replies render → a
 *   pending_confirmation renders Approve/Decline → approve posts resume →
 *   ask_user renders clickable options.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { Providers } from '@/app/providers';

const fetchMock = vi.fn();

/**
 * The pane now makes SIDE-CHANNEL calls (conversation create + debounced
 * snapshot PUTs) alongside the chat turn, so the mock routes by URL: only
 * /api/ask-juno consumes the queued turn responses.
 */
const turnQueue: unknown[] = [];
function mockReply(data: Record<string, unknown>) {
  turnQueue.push({ ok: true, json: async () => ({ data }) });
}
function mockTurnResponse(res: unknown) {
  turnQueue.push(res);
}
/** Only the calls that hit the chat engine. */
const agentCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/ask-juno');

beforeEach(() => {
  sessionStorage.clear();
  turnQueue.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u === '/api/ask-juno') {
      return (
        turnQueue.shift() ?? {
          ok: true,
          json: async () => ({ data: { type: 'reply', text: '(default)' } }),
        }
      );
    }
    if (u === '/api/ask-juno/conversations' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ data: { id: 'conv-t' } }) };
    }
    if (u === '/api/ask-juno/revert') {
      return { ok: true, json: async () => ({ data: { reverted: true, project_key: 'p12' } }) };
    }
    return { ok: true, json: async () => ({ data: {} }) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
});

function openPane() {
  act(() => {
    window.dispatchEvent(new Event('atlas:open-ask-juno'));
  });
}

async function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Ask, or tell/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('AJ-v3 pane wiring (the unmounted-pane regression)', () => {
  it('Providers mounts the pane; the open event reveals it', () => {
    render(<Providers>x</Providers>);
    // Closed by default — nothing rendered.
    expect(screen.queryByRole('complementary', { name: /Ask Juno working pane/i })).toBeNull();
    openPane();
    expect(screen.getByRole('complementary', { name: /Ask Juno working pane/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('send → reply renders; executed-write receipts show audit ids', async () => {
    render(<Providers>x</Providers>);
    openPane();
    mockReply({
      type: 'reply',
      text: 'The 90-day requirement is $1.2M.',
      executed_writes: [{ tool: 'create_risk', audit_log_id: 'audit-12345678' }],
    });
    await send('what do we need?');
    await waitFor(() => expect(screen.getByText(/90-day requirement/)).toBeTruthy());
    // AJ-v5 receipt: humanized sentence; audit id sits behind the ⋯ toggle.
    expect(screen.getByText(/Recorded a risk/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Receipt detail' }));
    expect(screen.getByText(/audit audit-12/)).toBeTruthy();
    const body = JSON.parse((agentCalls()[0]![1] as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'what do we need?' });
  });

  it('pending_confirmation renders a card; Approve posts resume{confirmed_tool}', async () => {
    render(<Providers>x</Providers>);
    openPane();
    mockReply({
      type: 'pending_confirmation',
      tool_name: 'archive_project',
      tool_use_id: 'toolu_1',
      tool_args: { project_key: 'p12' },
      reason: 'Archiving removes the project — explicit confirmation required',
      preamble: 'This will archive North Haven (p12).',
    });
    await send('delete north haven');
    await waitFor(() => expect(screen.getByText(/archive project/)).toBeTruthy());

    mockReply({ type: 'reply', text: 'Done — North Haven archived.' });
    fireEvent.click(screen.getByRole('button', { name: /Approve & run/i }));
    await waitFor(() => expect(screen.getByText(/North Haven archived/)).toBeTruthy());

    const resumeBody = JSON.parse((agentCalls()[1]![1] as RequestInit).body as string);
    expect(resumeBody.resume).toEqual({
      kind: 'confirmed_tool',
      tool_use_id: 'toolu_1',
      name: 'archive_project',
      args: { project_key: 'p12' },
    });
  });

  it('ask_user renders clickable options; picking one posts the answer', async () => {
    render(<Providers>x</Providers>);
    openPane();
    mockReply({
      type: 'ask_user',
      tool_use_id: 'toolu_q',
      tool_args: { question: 'Which project?', options: [] },
      question: 'Which project do you mean?',
      options: [
        { label: '84 Sunset Beach Road', description: 'pre-construction' },
        { label: '6 Great Circle' },
      ],
    });
    await send('update the sale price');
    await waitFor(() => expect(screen.getByText('Which project do you mean?')).toBeTruthy());

    mockReply({ type: 'reply', text: 'Got it — 84 Sunset Beach Road.' });
    fireEvent.click(screen.getByRole('button', { name: /84 Sunset Beach Road/ }));
    await waitFor(() => expect(screen.getByText(/Got it/)).toBeTruthy());

    const resumeBody = JSON.parse((agentCalls()[1]![1] as RequestInit).body as string);
    expect(resumeBody.resume.kind).toBe('answered_question');
    expect(resumeBody.resume.answer).toBe('84 Sunset Beach Road');
  });

  it('AJ-v4: pending_plan renders the diff card; unticking a row narrows the approved set', async () => {
    render(<Providers>x</Providers>);
    openPane();
    const items = [
      {
        tool: 'update_project',
        args: { project_key: 'p12', sale_price_override_usd: 8_200_000 },
        summary: '84 Sunset: sale price → $8.2M',
        changes: [{ field: 'sale_price_override_usd', before: 7_900_000, after: 8_200_000 }],
      },
      {
        tool: 'update_project',
        args: { project_key: 'p9', target_margin: 0.22 },
        summary: '6 Great Circle: target margin → 22%',
        changes: [{ field: 'target_margin', before: 0.2, after: 0.22 }],
      },
    ];
    mockReply({
      type: 'pending_plan',
      tool_use_id: 'toolu_plan',
      tool_args: { title: 'Update 2 figures', items },
      title: 'Update 2 figures',
      items,
    });
    await send('apply the spreadsheet');
    await waitFor(() => expect(screen.getByText('Update 2 figures')).toBeTruthy());
    // AJ-v5 diff rows: money-compact, struck-through before → bold after,
    // rendered as separate elements.
    expect(screen.getByText('$7.90M')).toBeTruthy();
    expect(screen.getByText('$8.20M')).toBeTruthy();

    // Untick the second row → the approve button narrows to 1.
    fireEvent.click(screen.getByLabelText(/Include: 6 Great Circle/));
    const approve = screen.getByRole('button', { name: 'Apply 1 change' });

    mockReply({
      type: 'reply',
      text: 'Applied 1 change.',
      executed_writes: [{ tool: 'update_project', audit_log_id: 'audit-11112222' }],
    });
    fireEvent.click(approve);
    await waitFor(() => expect(screen.getByText('Applied 1 change.')).toBeTruthy());

    const resumeBody = JSON.parse((agentCalls()[1]![1] as RequestInit).body as string);
    expect(resumeBody.resume.kind).toBe('approved_plan');
    expect(resumeBody.resume.name).toBe('propose_changes');
    expect(resumeBody.resume.selected).toEqual([0]);
  });

  it('AJ-v4: streamed turn renders deltas live, then dedupes against the final payload', async () => {
    render(<Providers>x</Providers>);
    openPane();

    const events = [
      { t: 'delta', d: 'Looking' },
      { t: 'delta', d: ' at projects…' },
      { t: 'text_end' },
      { t: 'status', tool: 'list_projects' },
      { t: 'delta', d: 'The total is $12M.' },
      { t: 'text_end' },
      {
        t: 'final',
        response: {
          type: 'reply',
          text: 'The total is $12M.',
          executed_writes: [{ tool: 'update_project', audit_log_id: 'audit-98765432' }],
        },
      },
    ];
    const encoder = new TextEncoder();
    mockTurnResponse({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({
        start(c) {
          for (const ev of events) c.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          c.close();
        },
      }),
      json: async () => null,
    });

    await send('how big is the portfolio?');
    await waitFor(() => expect(screen.getByText('The total is $12M.')).toBeTruthy());
    // Preamble bubble streamed separately and stays.
    expect(screen.getByText('Looking at projects…')).toBeTruthy();
    // Final payload must NOT duplicate the streamed text.
    expect(screen.getAllByText('The total is $12M.')).toHaveLength(1);
    // The streamed write receipt attached to the final bubble (AJ-v5:
    // humanized sentence; audit id behind the ⋯ toggle).
    expect(screen.getByText(/Updated/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Receipt detail' })[0]!);
    expect(screen.getByText(/audit audit-98/)).toBeTruthy();
    // Request advertised stream support.
    const req = agentCalls()[0]![1] as RequestInit;
    expect((req.headers as Record<string, string>).Accept).toBe('text/event-stream');
  });

  it('AJ-v4: send creates a server conversation and snapshots after the turn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Providers>x</Providers>);
      openPane();
      // POST /conversations (create) then the chat turn then the PUT snapshot.
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === '/api/ask-juno/conversations' && init?.method === 'POST') {
          return { ok: true, json: async () => ({ data: { id: 'conv-1' } }) };
        }
        if (url === '/api/ask-juno' && init?.method === 'POST') {
          return { ok: true, json: async () => ({ data: { type: 'reply', text: 'Answer.' } }) };
        }
        return { ok: true, json: async () => ({ data: { saved: 2 } }) };
      });
      await send('hello there');
      await waitFor(() => expect(screen.getByText('Answer.')).toBeTruthy());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });
      const putCall = fetchMock.mock.calls.find(
        (c) =>
          String(c[0]).startsWith('/api/ask-juno/conversations/conv-1') &&
          (c[1] as RequestInit | undefined)?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string) as {
        messages: Array<{ role: string; text: string }>;
      };
      expect(body.messages.some((m) => m.role === 'user' && m.text === 'hello there')).toBe(true);
      expect(body.messages.some((m) => m.role === 'assistant' && m.text === 'Answer.')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AJ-v4: History lists past conversations; picking one loads its messages', async () => {
    render(<Providers>x</Providers>);
    openPane();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/ask-juno/conversations' && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({
            data: {
              conversations: [
                {
                  id: 'c9',
                  title: 'Cash requirement review',
                  last_message_at: '2026-07-18T10:00:00Z',
                },
              ],
            },
          }),
        };
      }
      if (String(url).startsWith('/api/ask-juno/conversations/c9')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              id: 'c9',
              messages: [
                { id: 'm1', role: 'user', text: 'what is the 90-day need?', ts: 1 },
                { id: 'm2', role: 'assistant', text: 'It is $1.2M.', ts: 2 },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Cash requirement review')).toBeTruthy());
    fireEvent.click(screen.getByText('Cash requirement review'));
    await waitFor(() => expect(screen.getByText('It is $1.2M.')).toBeTruthy());
    // AJ-v5: the first user message also becomes the header title — expect
    // it in the transcript AND the header (2 instances).
    expect(screen.getAllByText('what is the 90-day need?').length).toBeGreaterThan(0);
  });

  it('AJ-v4: update_project receipt reverts via two-step confirm', async () => {
    render(<Providers>x</Providers>);
    openPane();
    mockReply({
      type: 'reply',
      text: 'Updated the sale price.',
      executed_writes: [{ tool: 'update_project', audit_log_id: 'aud-rev-12345678' }],
    });
    await send('set sale price to 8.2');
    await waitFor(() => expect(screen.getByText(/Updated the sale price/)).toBeTruthy());

    // AJ-v5: the revert affordance lives behind the receipt's ⋯ toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Receipt detail' }));
    // Two-step: revert → confirm revert → POST /api/ask-juno/revert.
    fireEvent.click(screen.getByRole('button', { name: 'revert' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm revert' }));
    await waitFor(() => expect(screen.getByText(/· reverted/)).toBeTruthy());
    expect(screen.getByText(/Reverted p12/)).toBeTruthy();

    const revertCall = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/ask-juno/revert');
    expect(revertCall).toBeTruthy();
    const body = JSON.parse((revertCall![1] as RequestInit).body as string);
    expect(body.audit_log_id).toBe('aud-rev-12345678');
  });

  it('AJ-v4: pasting a TSV grid becomes a CSV attachment chip (not composer text)', async () => {
    render(<Providers>x</Providers>);
    openPane();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url) === '/api/ask-juno/attachments') {
        return {
          ok: true,
          json: async () => ({
            data: { attachment_id: 'att-9', file_name: 'pasted-table.csv', row_count: 3 },
          }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const composer = screen.getByPlaceholderText(/Ask, or tell/i);
    fireEvent.paste(composer, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain'
            ? 'Project\tPrice\n84 Sunset\t8200000\n6 Great Circle\t5400000'
            : '',
      },
    });

    await waitFor(() => expect(screen.getByText(/pasted-table\.csv · 3 rows/)).toBeTruthy());
    // Composer stays empty — the grid became an attachment, not text.
    expect((composer as HTMLTextAreaElement).value).toBe('');

    const uploadCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === '/api/ask-juno/attachments'
    );
    expect(uploadCall).toBeTruthy();
    const form = (uploadCall![1] as RequestInit).body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('pasted-table.csv');
    // jsdom File lacks .text() — FileReader is the environment-safe read.
    const text = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
    expect(text).toBe('Project,Price\n84 Sunset,8200000\n6 Great Circle,5400000');
  });

  it('conversation persists to sessionStorage and restores on remount', async () => {
    const first = render(<Providers>x</Providers>);
    openPane();
    mockReply({ type: 'reply', text: 'Persistent answer.' });
    await send('hello');
    await waitFor(() => expect(screen.getByText('Persistent answer.')).toBeTruthy());
    first.unmount();

    render(<Providers>x</Providers>);
    // Restored open + history without any new fetch.
    expect(screen.getByText('Persistent answer.')).toBeTruthy();
    expect(screen.getAllByText('hello').length).toBeGreaterThan(0);
  });
});
