import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '../config/app-config';
import { AppException } from '../common/exceptions/app.exception';
import { CsrfGuard } from './csrf.guard';
import type { CsrfMode } from './decorators';

const ORIGIN = 'http://localhost:5173';
const TOKEN = 'a'.repeat(43);

function run(
  req: { method: string; headers?: Record<string, string>; auth?: unknown },
  mode?: CsrfMode,
): boolean {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(mode);
  const config = { get: () => ORIGIN } as unknown as AppConfig;
  const guard = new CsrfGuard(reflector, config);
  const context = {
    getType: () => 'http',
    getHandler: () => run,
    getClass: () => CsrfGuard,
    switchToHttp: () => ({ getRequest: () => ({ path: '/x', headers: {}, ...req }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

const withSession = { auth: { session: { csrfToken: TOKEN } } };

function expectForbidden(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(403);
    expect((error as AppException).code).toBe('INVALID_CSRF_TOKEN');
    return;
  }
  throw new Error('Expected a 403');
}

describe('CsrfGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('lets safe method %s through', (method) => {
    expect(run({ method, ...withSession })).toBe(true);
  });

  it('accepts the session token', () => {
    expect(run({ method: 'POST', headers: { 'x-csrf-token': TOKEN }, ...withSession })).toBe(true);
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'x-csrf-token': 'b'.repeat(43) }],
    ['different length', { 'x-csrf-token': 'short' }],
  ])('rejects a %s token when a session is attached', (_label, headers) => {
    expectForbidden(() => run({ method: 'POST', headers, ...withSession }));
  });

  it('does not accept Origin + X-Requested-With instead of the token when a session exists', () => {
    expectForbidden(() =>
      run({
        method: 'POST',
        headers: { origin: ORIGIN, 'x-requested-with': 'fetch' },
        ...withSession,
      }),
    );
  });

  it('requires Origin + X-Requested-With without a session', () => {
    expect(run({ method: 'POST', headers: { origin: ORIGIN, 'x-requested-with': 'fetch' } })).toBe(
      true,
    );
    expectForbidden(() => run({ method: 'POST', headers: { origin: ORIGIN } }));
    expectForbidden(() =>
      run({
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-requested-with': 'fetch' },
      }),
    );
  });

  it("uses the Origin check in 'origin' mode even with a session", () => {
    expect(
      run(
        {
          method: 'POST',
          headers: { origin: ORIGIN, 'x-requested-with': 'fetch' },
          ...withSession,
        },
        'origin',
      ),
    ).toBe(true);
  });

  it("skips the check in 'none' mode", () => {
    expect(run({ method: 'POST' }, 'none')).toBe(true);
  });
});
