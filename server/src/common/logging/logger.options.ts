import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

/** Paths censored in every log line: credentials, session material and secrets. */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'csrfToken',
  '*.password',
  '*.passwordHash',
  '*.csrfToken',
];

export function loggerOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      // The request-id middleware runs first and has already set `req.id`.
      genReqId: (req) => req.id,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}
