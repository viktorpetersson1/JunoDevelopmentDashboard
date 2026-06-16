/**
 * Regression for the Phase B "nothing happens when I use it" bug: startRun held
 * busy=true, and the auto-advance was gated by !busy, so a freshly-created run
 * never POSTed /advance (it only un-stuck on a page refresh via the resume path).
 * This test asserts that clicking Run drives the run to /advance and renders the
 * synthesised answer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentRunPanel } from '../agent-run-panel';

function sseResponse(frames: object[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < frames.length) {
            const f = frames[i++];
            return { value: enc.encode(`data: ${JSON.stringify(f)}\n\n`), done: false };
          }
          return { value: undefined, done: true };
        },
      }),
    },
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AgentRunPanel — create then auto-advance', () => {
  it('POSTs /advance after creating a run and renders the answer (regression)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/agent/runs' && method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ data: { run: { id: 'run-1' } } }) } as unknown as Response;
      }
      if (url === '/api/agent/runs' && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: { runs: [] } }) } as unknown as Response;
      }
      if (url === '/api/agent/runs/run-1/advance' && method === 'POST') {
        return sseResponse([
          { type: 'run', status: 'running', currentStep: 0, costSpent: 0, goal: 'g' },
          { type: 'plan', summary: 'plan it', steps: [{ idx: 0, tool: null, type: 'synthesize' }] },
          { type: 'done', answer: 'Three levers to make Juno more profitable…', costSpent: 0.012 },
        ]);
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentRunPanel />);

    fireEvent.change(screen.getByPlaceholderText(/Ask Juno to analyse/i), {
      target: { value: 'how do we make juno more profitable' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // The bug: /advance was never called. The fix: it is.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/agent/runs/run-1/advance')).toBe(true)
    );

    // And the streamed answer renders.
    await screen.findByText(/Three levers to make Juno more profitable/);
  });
});
