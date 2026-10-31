import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ErrorCode, type SignInInput, type SignUpInput } from '@auth-app/shared';
import { AppException } from '../common/exceptions/app.exception.js';
import type { ClientContext } from '../sessions/client-context.js';
import { SessionsService, type StartedSession } from '../sessions/sessions.service.js';
import type { UserDocument } from '../users/user.schema.js';
import { UsersService } from '../users/users.service.js';
import { emailLogHash } from './email-hash.js';

export interface SignedIn extends StartedSession {
  user: UserDocument;
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  /** Verified when the email is unknown, so both failure paths cost one argon2 verify. */
  private readonly dummyHash = hash(randomBytes(32).toString('hex'), { type: argon2id });

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
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
    const user = await this.users.findByEmailWithPassword(input.email);
    const passwordMatches = user
      ? await verify(user.passwordHash, input.password)
      : await verify(await this.dummyHash, input.password).then(() => false);

    if (!user || !passwordMatches) {
      this.logger.info(
        { event: 'signin_failed', emailHash: emailLogHash(input.email) },
        'Sign-in failed',
      );
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        INVALID_CREDENTIALS_MESSAGE,
      );
    }

    const started = await this.sessions.start(user._id, context);
    this.logger.info({ event: 'signin', userId: user.id }, 'User signed in');
    return { user, ...started };
  }
}
