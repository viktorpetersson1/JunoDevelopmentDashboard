import { describe, expect, it, vi } from 'vitest';
import { withErrorBoundary } from '../handler';
import { UnauthorizedError, ForbiddenError } from '@/lib/auth/requireAuth';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as { error?: { code: string; message: string } };
}

describe('withErrorBoundary', () => {
  it('passes through successful responses unchanged', async () => {
    const handler = withErrorBoundary(async () => new Response('hi', { status: 200 }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hi');
  });

  it('maps UnauthorizedError to 401 { error }', async () => {
    const handler = withErrorBoundary(async () => {
      throw new UnauthorizedError('No session');
    });
    const res = await handler();
    expect(res.status).toBe(401);
    expect((await readJson(res)).error?.code).toBe('UNAUTHENTICATED');
  });

  it('maps ForbiddenError to 403 { error }', async () => {
    const handler = withErrorBoundary(async () => {
      throw new ForbiddenError('Not allowed');
    });
    const res = await handler();
    expect(res.status).toBe(403);
    expect((await readJson(res)).error?.code).toBe('FORBIDDEN');
  });

  it('catches unknown errors → 500 with INTERNAL_ERROR (no leakage)', async () => {
    // Silence the warn() call from the handler's error log
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = withErrorBoundary(async () => {
      throw new Error('secret stack details');
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error?.code).toBe('INTERNAL_ERROR');
    // Make sure the original message is NOT leaked to the response body
    expect(body.error?.message).not.toContain('secret stack');
    spy.mockRestore();
  });
});
