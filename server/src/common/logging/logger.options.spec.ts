import pino from 'pino';
import type { Options } from 'pino-http';
import { loggerOptions } from './logger.options';

/** Logs one record through pino with our redact config and returns the serialized line. */
function logLine(record: Record<string, unknown>): string {
  const { pinoHttp } = loggerOptions({ NODE_ENV: 'production', LOG_LEVEL: 'info' });
  const { redact } = pinoHttp as Options;
  const lines: string[] = [];
  const logger = pino({ redact }, { write: (line: string) => lines.push(line) });
  logger.info(record, 'test');
  return lines.join('');
}

describe('logger redaction', () => {
  it('censors credentials and session material in request/response logs', () => {
    const line = logLine({
      req: {
        headers: {
          cookie: 'sid=SECRET_SID; refresh_token=SECRET_REFRESH',
          authorization: 'Bearer SECRET_BEARER',
          'x-csrf-token': 'SECRET_CSRF',
          'user-agent': 'jest',
        },
      },
      res: { headers: { 'set-cookie': 'sid=SECRET_SET_COOKIE; HttpOnly' } },
    });

    expect(line).not.toMatch(/SECRET_/);
    expect(line).toContain('[REDACTED]');
    // Non-sensitive fields are kept.
    expect(line).toContain('jest');
  });

  it('censors password, password hash and CSRF token fields at the top level and one level down', () => {
    const line = logLine({
      password: 'SECRET_PASSWORD',
      passwordHash: 'SECRET_HASH',
      csrfToken: 'SECRET_TOKEN',
      body: { password: 'SECRET_BODY_PASSWORD', email: 'kept@example.com' },
      user: { passwordHash: 'SECRET_USER_HASH', csrfToken: 'SECRET_USER_TOKEN' },
    });

    expect(line).not.toMatch(/SECRET_/);
    expect(line).toContain('kept@example.com');
  });
});
