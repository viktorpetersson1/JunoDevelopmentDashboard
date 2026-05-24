/**
 * Route handler wrapper that maps thrown UnauthorizedError / ForbiddenError
 * to the corresponding HTTP envelope, and any other thrown error to 500.
 *
 * Usage:
 *   export const GET = withErrorBoundary(async () => {
 *     const { user, profile } = await requireAuth();
 *     return ok({ user, profile });
 *   });
 */
import { log } from '@/lib/utils/log';
import { UnauthorizedError, ForbiddenError } from '@/lib/auth/requireAuth';
import { forbidden, serverError, unauthorized } from './response';

type Handler<TArgs extends unknown[]> = (...args: TArgs) => Promise<Response> | Response;

export function withErrorBoundary<TArgs extends unknown[]>(
  handler: Handler<TArgs>
): Handler<TArgs> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return unauthorized(err.message, err.code);
      }
      if (err instanceof ForbiddenError) {
        return forbidden(err.message, err.code);
      }
      log.error('Unhandled route error', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return serverError();
    }
  };
}
