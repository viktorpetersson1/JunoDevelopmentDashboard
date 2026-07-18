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
}));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { Providers } from '@/app/providers';

const fetchMock = vi.fn();

function mockReply(data: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data }),
  });
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
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
  fireEvent.change(screen.getByPlaceholderText(/Ask, or tell me/i), { target: { value: text } });
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
    // Receipt line: "✓ create risk · audit <first-8-chars>"
    expect(screen.getByText(/create risk · audit audit-12/)).toBeTruthy();
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
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
    await waitFor(() => expect(screen.getByText('archive project')).toBeTruthy());

    mockReply({ type: 'reply', text: 'Done — North Haven archived.' });
    fireEvent.click(screen.getByRole('button', { name: /Approve & run/i }));
    await waitFor(() => expect(screen.getByText(/North Haven archived/)).toBeTruthy());

    const resumeBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
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

    const resumeBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(resumeBody.resume.kind).toBe('answered_question');
    expect(resumeBody.resume.answer).toBe('84 Sunset Beach Road');
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
    fetchMock.mockResolvedValueOnce({
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
    // The streamed write receipt attached to the final bubble.
    expect(screen.getByText(/update project · audit audit-98/)).toBeTruthy();
    // Request advertised stream support.
    const req = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((req.headers as Record<string, string>).Accept).toBe('text/event-stream');
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
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
