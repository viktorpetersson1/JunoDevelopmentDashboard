// Per CLAUDE.md §7: no console.log in committed code. Use this logger.
// Wraps console.warn/error; production sink is wired in T076 (Sentry).

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
  };

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(payload);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(payload);
  } else {
    // eslint-disable-next-line no-console
    console.warn(payload);
  }
}

export const log = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
