import { describe, expect, it } from 'vitest';
import { GET } from '../route';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as { status?: string; commit?: string; time?: string };
}

/**
 * T084.2 — public /api/health now returns ONLY {status: 'ok'}.
 * commit + time moved to /api/health/detailed behind super_admin auth
 * so unauthenticated callers can't fingerprint the deploy.
 */
describe('GET /api/health (public)', () => {
  it('returns 200 with bare { status: "ok" }', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe('ok');
  });

  it('does NOT leak commit or time to unauthenticated callers', async () => {
    const res = GET();
    const body = await readJson(res);
    expect(body.commit).toBeUndefined();
    expect(body.time).toBeUndefined();
  });

  it('sets Cache-Control: no-store so probes always hit the function', async () => {
    const res = GET();
    expect(res.headers.get('cache-control')).toMatch(/no-store/i);
  });
});
