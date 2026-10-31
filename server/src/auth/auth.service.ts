import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ErrorCode, type SignInInput, type SignUpInput } from '@auth-app/shared';
import { AppException } from '../common/exceptions/app.exception.js';
import type { ClientContext } from '../sessions/client-context.js';
import type { SessionDocument } from '../sessions/session.schema.js';
import { SessionsService, type StartedSession } from '../sessions/sessions.service.js';
import type { UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { emailLogHash } from './email-hash.js';
import { LockoutService } from './lockout/lockout.service.js';

export interface SignedIn extends StartedSession {
  user: UserDocument;
}

export interface Refreshed {
  user: UserDocument;
  session: SessionDocument;
}

@Injectable()
export class AuthService {
  /** Verified when the email is unknown, so both failure paths cost one argon2 verify. */
  private readonly dummyHash = hash(randomBytes(32).toString('hex'), { type: argon2id });

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly lockout: LockoutService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  async signUp(input: SignUpInput, context: ClientContext): Promise<SignedIn> {
    const passwordHash = await hash(input.password, { type: argon2id });
    // TODO(outbox): email verification / welcome email. Insert the user and an `outbox` event
    // ({ type: 'user.signed_up', userId, createdAt }) in one Mongo transaction (Compose runs a
    // replica set, so transactions work); a separate worker reads the outbox, sends the email
    // and marks the event done. The request never waits on, or fails because of, the mailer.
    const user = await this.users.create({ email: input.email, name: input.name, passwordHash });
    const started = await this.sessions.start(user._id, context);
    this.logger.info({ event: 'signup', userId: user.id }, 'User signed up');
    return { user, ...started };
  }

  async signIn(input: SignInInput, context: ClientContext): Promise<SignedIn> {
    const emailHash = emailLogHash(input.email);

    // Checked before the lookup: no argon2 work (and no answer) while locked, even for the
    // right password.
    const retryAfter = await this.lockout.retryAfterSeconds(input.email);
    if (retryAfter > 0) {
      this.logger.info({ event: 'signin_locked', emailHash }, 'Sign-in refused: email locked');
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed sign-in attempts, try again later',
        undefined,
        { 'Retry-After': String(retryAfter) },
      );
    }

    const user = await this.users.findByEmailWithPassword(input.email);
    const passwordMatches = user
      ? await verify(user.passwordHash, input.password)
      : await verify(await this.dummyHash, input.password).then(() => false);

    if (!user || !passwordMatches) {
      const locked = await this.lockout.registerFailure(input.email);
      this.logger.info({ event: 'signin_failed', emailHash }, 'Sign-in failed');
      if (locked) {
        this.logger.warn({ event: 'lockout_started', emailHash }, 'Email locked after failures');
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    await this.lockout.reset(input.email);
    const started = await this.sessions.start(user._id, context);
    this.logger.info({ event: 'signin', userId: user.id }, 'User signed in');
    return { user, ...started };
  }

  async refresh(
    refreshToken: string | undefined,
    presentedSessionId: string | undefined,
    context: ClientContext,
  ): Promise<Refreshed> {
    const session = refreshToken
      ? await this.sessions.refresh(refreshToken, presentedSessionId, context)
      : null;
    const user = session ? await this.users.findById(session.userId) : null;
    if (!session || !user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Session expired, please sign in again',
      );
    }
    this.logger.info({ event: 'refresh', userId: user.id }, 'Session refreshed');
    return { user, session };
  }

  async logout(cookies: { refreshToken?: string; sessionId?: string }): Promise<void> {
    await this.sessions.end(cookies);
    this.logger.info({ event: 'logout' }, 'Signed out');
  }
}
