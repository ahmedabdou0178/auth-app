import type { Redis } from 'ioredis';
import { toIntegers } from '../../common/redis/lua.js';

export const LOCKOUT_STORE = Symbol('LOCKOUT_STORE');

/** Failed sign-in counters per (hashed) email. */
export interface LockoutStore {
  /** Milliseconds left on the lock, 0 when not locked. */
  lockedForMs(key: string): Promise<number>;
  /** Counts a failure in a window of `durationMs`; at `maxAttempts` locks for `durationMs`. Returns true when this failure locked the key. */
  recordFailure(key: string, maxAttempts: number, durationMs: number): Promise<boolean>;
  reset(key: string): Promise<void>;
}

/** KEYS: fails, lock. ARGV: duration ms, max attempts. Returns 1 when this call locked. */
export const RECORD_FAILURE_SCRIPT = `
local fails = redis.call('INCR', KEYS[1])
if fails == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
if fails >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[1])
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;

/** Shared by every API instance, so one email can't get N× the attempts behind a load balancer. */
export class RedisLockoutStore implements LockoutStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'lockout',
  ) {}

  async lockedForMs(key: string): Promise<number> {
    const pttl = await this.redis.pttl(this.lockKey(key));
    return Math.max(pttl, 0);
  }

  async recordFailure(key: string, maxAttempts: number, durationMs: number): Promise<boolean> {
    const reply = await this.redis.eval(
      RECORD_FAILURE_SCRIPT,
      2,
      this.failsKey(key),
      this.lockKey(key),
      durationMs,
      maxAttempts,
    );
    const [locked] = toIntegers([reply], 1);
    return locked === 1;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.failsKey(key));
  }

  // Hash tags keep both keys in one cluster slot.
  private failsKey(key: string): string {
    return `${this.prefix}:{${key}}:fails`;
  }

  private lockKey(key: string): string {
    return `${this.prefix}:{${key}}:lock`;
  }
}

/** Single-process fallback when REDIS_URL is unset (local development, tests). */
export class MemoryLockoutStore implements LockoutStore {
  private readonly failures = new Map<string, { count: number; windowEndsAt: number }>();
  private readonly locks = new Map<string, number>();

  lockedForMs(key: string): Promise<number> {
    const until = this.locks.get(key);
    const remaining = until === undefined ? 0 : until - Date.now();
    if (remaining <= 0) this.locks.delete(key);
    return Promise.resolve(Math.max(remaining, 0));
  }

  recordFailure(key: string, maxAttempts: number, durationMs: number): Promise<boolean> {
    const now = Date.now();
    const current = this.failures.get(key);
    const entry =
      current && current.windowEndsAt > now
        ? current
        : { count: 0, windowEndsAt: now + durationMs };
    entry.count += 1;
    if (entry.count >= maxAttempts) {
      this.failures.delete(key);
      this.locks.set(key, now + durationMs);
      return Promise.resolve(true);
    }
    this.failures.set(key, entry);
    return Promise.resolve(false);
  }

  reset(key: string): Promise<void> {
    this.failures.delete(key);
    return Promise.resolve();
  }
}
