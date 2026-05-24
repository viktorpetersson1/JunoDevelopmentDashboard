import { describe, expect, it } from 'vitest';
import {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
} from '../response';

async function readJson(res: Response) {
  return JSON.parse(await res.text()) as unknown;
}

describe('response envelopes', () => {
  it('ok() returns { data } with status 200', async () => {
    const r = ok({ x: 1 });
    expect(r.status).toBe(200);
    expect(await readJson(r)).toEqual({ data: { x: 1 } });
  });

  it('created() returns { data } with status 201', async () => {
    const r = created({ id: 'a' });
    expect(r.status).toBe(201);
    expect(await readJson(r)).toEqual({ data: { id: 'a' } });
  });

  it.each([
    ['badRequest', badRequest('bad'), 400, 'BAD_REQUEST', 'bad'],
    ['unauthorized', unauthorized(), 401, 'UNAUTHENTICATED', 'Authentication required'],
    ['forbidden', forbidden(), 403, 'FORBIDDEN', 'Insufficient role'],
    ['notFound', notFound(), 404, 'NOT_FOUND', 'Not found'],
    ['conflict', conflict('clash'), 409, 'CONFLICT', 'clash'],
    ['serverError', serverError(), 500, 'INTERNAL_ERROR', 'Unexpected server error'],
  ] as const)(
    '%s returns { error } with correct status + code',
    async (_n, res, status, code, msg) => {
      expect(res.status).toBe(status);
      const body = (await readJson(res)) as { error: { code: string; message: string } };
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe(msg);
    }
  );
});
