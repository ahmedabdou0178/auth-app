import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { sha256Hex } from '../../sessions/tokens.js';
import { LOCKOUT_STORE, type LockoutStore } from './lockout.store.js';

/**
 * Per-email lockout after repeated failed sign-ins. Keyed by a hash of the normalized email,
 * not by user, so unknown emails lock exactly like real ones (no account enumeration).
 * The per-IP rate limit covers one IP trying many emails; this covers many IPs trying one.
 */
@Injectable()
export class LockoutService {
  constructor(
    @Inject(LOCKOUT_STORE) private readonly store: LockoutStore,
    private readonly config: AppConfig,
  ) {}

  /** Seconds until the email unlocks; 0 when it is not locked. */
  async retryAfterSeconds(email: string): Promise<number> {
    return Math.ceil((await this.store.lockedForMs(sha256Hex(email))) / 1000);
  }

  /** Returns true when this failure reached the limit and locked the email. */
  registerFailure(email: string): Promise<boolean> {
    return this.store.recordFailure(
      sha256Hex(email),
      this.config.get('LOCKOUT_MAX_ATTEMPTS'),
      this.config.get('LOCKOUT_DURATION') * 1000,
    );
  }

  reset(email: string): Promise<void> {
    return this.store.reset(sha256Hex(email));
  }
}
