/**
 * Ask Juno v2 — minimal SSE helper. Web-standard ReadableStream (no new dep;
 * edge-safe). `handler` receives `emit` and resolves when the stream should
 * close. An uncaught error becomes a final `error` event so the client always
 * sees a clean terminus.
 */
import type { AgentEvent } from './runner';

export function sseStream(handler: (emit: (e: AgentEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // stream already closed (client disconnected) — ignore
        }
      };
      try {
        await handler(emit);
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
