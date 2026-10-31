import { HttpStatus } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PinoLogger } from 'nestjs-pino';
import { Types } from 'mongoose';
import { ErrorCode } from '@auth-app/shared';
import { AppException } from '../common/exceptions/app.exception';
import type { SessionsService } from '../sessions/sessions.service';
import type { UserDocument } from '../users/user.schema';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { LockoutService } from './lockout/lockout.service';

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});

const PASSWORD = 'Secr3t!pass';
const CONTEXT = { ip: '127.0.0.1' };

function setup() {
  const users = {
    create: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findById: jest.fn(),
  };
  const session = { sessionId: 'sid', csrfToken: 'csrf', userId: new Types.ObjectId() };
  const sessions = {
    start: jest.fn().mockResolvedValue({ session, refreshToken: 'rt' }),
    refresh: jest.fn(),
    end: jest.fn(),
  };
  const lockout = {
    retryAfterSeconds: jest.fn().mockResolvedValue(0),
    registerFailure: jest.fn().mockResolvedValue(false),
    reset: jest.fn(),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const service = new AuthService(
    users as unknown as UsersService,
    sessions as unknown as SessionsService,
    lockout as unknown as LockoutService,
    logger as unknown as PinoLogger,
  );
  return { service, users, sessions, lockout, logger, session };
}

async function userWithPassword(password: string): Promise<UserDocument> {
  return {
    _id: new Types.ObjectId(),
    id: 'user-id',
    email: 'ada@example.com',
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
  } as unknown as UserDocument;
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(status);
  expect((error as AppException).code).toBe(code);
  return error as AppException;
}

beforeEach(() => {
  jest.mocked(argon2.verify).mockClear();
});

describe('AuthService.signUp', () => {
  it('stores an argon2id hash, never the password, and starts a session', async () => {
    const { service, users, sessions } = setup();
    users.create.mockImplementation((data: { passwordHash: string }) =>
      Promise.resolve({ _id: new Types.ObjectId(), id: 'u1', ...data }),
    );

    await service.signUp({ email: 'ada@example.com', name: 'Ada', password: PASSWORD }, CONTEXT);

    const [{ passwordHash }] = users.create.mock.calls[0] as [{ passwordHash: string }];
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain(PASSWORD);
    expect(await argon2.verify(passwordHash, PASSWORD)).toBe(true);
    expect(sessions.start).toHaveBeenCalledTimes(1);
  });

  it('propagates the 409 from a duplicate email', async () => {
    const { service, users, sessions } = setup();
    users.create.mockRejectedValue(
      new AppException(HttpStatus.CONFLICT, ErrorCode.EMAIL_TAKEN, 'Email is already registered'),
    );
    await expectAppError(
      service.signUp({ email: 'ada@example.com', name: 'Ada', password: PASSWORD }, CONTEXT),
      409,
      'EMAIL_TAKEN',
    );
    expect(sessions.start).not.toHaveBeenCalled();
  });
});

describe('AuthService.signIn', () => {
  it('signs in with the right password and resets the lockout counter', async () => {
    const { service, users, lockout } = setup();
    users.findByEmailWithPassword.mockResolvedValue(await userWithPassword(PASSWORD));
    const result = await service.signIn({ email: 'ada@example.com', password: PASSWORD }, CONTEXT);
    expect(result.refreshToken).toBe('rt');
    expect(lockout.reset).toHaveBeenCalledWith('ada@example.com');
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const wrong = setup();
    wrong.users.findByEmailWithPassword.mockResolvedValue(await userWithPassword(PASSWORD));
    const wrongError = await expectAppError(
      wrong.service.signIn({ email: 'ada@example.com', password: 'Wrong-pass1' }, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );

    const unknown = setup();
    unknown.users.findByEmailWithPassword.mockResolvedValue(null);
    jest.mocked(argon2.verify).mockClear();
    const unknownError = await expectAppError(
      unknown.service.signIn({ email: 'ghost@example.com', password: 'Wrong-pass1' }, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );

    expect(unknownError.message).toBe(wrongError.message);
    // The unknown email still costs one argon2 verify (timing parity).
    expect(argon2.verify).toHaveBeenCalledTimes(1);
    expect(unknown.lockout.registerFailure).toHaveBeenCalledWith('ghost@example.com');
    expect(unknown.sessions.start).not.toHaveBeenCalled();
  });

  it('logs only an email hash on failure', async () => {
    const { service, users, logger } = setup();
    users.findByEmailWithPassword.mockResolvedValue(null);
    await service
      .signIn({ email: 'ghost@example.com', password: 'x' }, CONTEXT)
      .catch(() => undefined);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('ghost@example.com');
  });

  it('refuses a locked email with 429 + Retry-After before any lookup or verify', async () => {
    const { service, users, lockout } = setup();
    lockout.retryAfterSeconds.mockResolvedValue(42);
    const error = await expectAppError(
      service.signIn({ email: 'ada@example.com', password: PASSWORD }, CONTEXT),
      429,
      'ACCOUNT_LOCKED',
    );
    expect(error.headers).toEqual({ 'Retry-After': '42' });
    expect(users.findByEmailWithPassword).not.toHaveBeenCalled();
    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('logs a warning when a failure starts a lockout', async () => {
    const { service, users, lockout, logger } = setup();
    users.findByEmailWithPassword.mockResolvedValue(null);
    lockout.registerFailure.mockResolvedValue(true);
    await service
      .signIn({ email: 'ghost@example.com', password: 'x' }, CONTEXT)
      .catch(() => undefined);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'lockout_started' }),
      expect.any(String),
    );
  });
});

describe('AuthService.refresh', () => {
  it('returns the new session and its user', async () => {
    const { service, sessions, users, session } = setup();
    const user = { id: 'u1' };
    sessions.refresh.mockResolvedValue(session);
    users.findById.mockResolvedValue(user);
    await expect(service.refresh('rt', 'old-sid', CONTEXT)).resolves.toEqual({ user, session });
    expect(sessions.refresh).toHaveBeenCalledWith('rt', 'old-sid', CONTEXT);
  });

  it.each([
    ['missing token', undefined, null, {}],
    ['revoked/expired/unknown token', 'rt', null, {}],
    ['deleted user', 'rt', { userId: new Types.ObjectId() }, null],
  ])('returns 401 INVALID_REFRESH_TOKEN for a %s', async (_label, token, session, user) => {
    const ctx = setup();
    ctx.sessions.refresh.mockResolvedValue(session);
    ctx.users.findById.mockResolvedValue(user);
    await expectAppError(
      ctx.service.refresh(token, undefined, CONTEXT),
      401,
      'INVALID_REFRESH_TOKEN',
    );
  });
});
