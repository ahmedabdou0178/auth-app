import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { sha256Hex } from '../../sessions/tokens.js';
import { LOCKOUT_STORE, type LockoutStore } from './lockout.store.js';

/** Which lock a failure triggered (both can start on the same failure). */
export interface FailureOutcome {
  /** This client IP is now locked out of this email. */
  pairLocked: boolean;
  /** Every IP is now locked out of this email (distributed attack). */
  accountLocked: boolean;
}

/**
 * Lockout after repeated failed sign-ins, at two levels:
 * - per (email, client IP), at LOCKOUT_MAX_ATTEMPTS: one IP can only lock itself out, so an
 *   attacker can't lock the real owner out by failing on purpose;
 * - per email across all IPs, at the much higher LOCKOUT_ACCOUNT_MAX_ATTEMPTS: stops a
 *   distributed brute force on one account.
 * Keys are hashes of the normalized email (and IP), not the user, so unknown emails lock exactly
 * like real ones (no account enumeration). The per-IP rate limit covers one IP trying many emails.
 */
@Injectable()
export class LockoutService {
  constructor(
    @Inject(LOCKOUT_STORE) private readonly store: LockoutStore,
    private readonly config: AppConfig,
  ) {}

  /** Seconds until this IP may try this email again; 0 when neither lock applies. */
  async retryAfterSeconds(email: string, ip: string | undefined): Promise<number> {
    const [pairMs, accountMs] = await Promise.all([
      this.store.lockedForMs(pairKey(email, ip)),
      this.store.lockedForMs(accountKey(email)),
    ]);
    return Math.ceil(Math.max(pairMs, accountMs) / 1000);
  }

  async registerFailure(email: string, ip: string | undefined): Promise<FailureOutcome> {
    const durationMs = this.config.get('LOCKOUT_DURATION') * 1000;
    const [pairLocked, accountLocked] = await Promise.all([
      this.store.recordFailure(
        pairKey(email, ip),
        this.config.get('LOCKOUT_MAX_ATTEMPTS'),
        durationMs,
      ),
      this.store.recordFailure(
        accountKey(email),
        this.config.get('LOCKOUT_ACCOUNT_MAX_ATTEMPTS'),
        durationMs,
      ),
    ]);
    return { pairLocked, accountLocked };
  }

  /**
   * After a successful sign-in, clears this IP's failures only. The account-wide count is left
   * to expire, so the owner signing in can't reset a distributed attack's progress.
   */
  reset(email: string, ip: string | undefined): Promise<void> {
    return this.store.reset(pairKey(email, ip));
  }
}

function pairKey(email: string, ip: string | undefined): string {
  return `ip:${sha256Hex(`${email}\n${ip ?? 'unknown'}`)}`;
}

function accountKey(email: string): string {
  return `account:${sha256Hex(email)}`;
}
