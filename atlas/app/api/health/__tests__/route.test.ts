import { describe, expect, it } from 'vitest';
import { GET } from '../route';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as { data?: { status: string; commit: string; time: string } };
}

describe('GET /api/health', () => {
  it('returns 200 with { data: { status, commit, time } } envelope', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.data?.status).toBe('ok');
    expect(typeof body.data?.commit).toBe('string');
    // ISO timestamp
    expect(body.data?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('uses RENDER_GIT_COMMIT when set; falls back to "dev"', async () => {
    const original = process.env.RENDER_GIT_COMMIT;
    try {
      process.env.RENDER_GIT_COMMIT = 'abc1234';
      const r1 = GET();
      expect((await readJson(r1)).data?.commit).toBe('abc1234');

      delete process.env.RENDER_GIT_COMMIT;
      const r2 = GET();
      expect((await readJson(r2)).data?.commit).toBe('dev');
    } finally {
      if (original !== undefined) {
        process.env.RENDER_GIT_COMMIT = original;
      } else {
        delete process.env.RENDER_GIT_COMMIT;
      }
    }
  });
});
