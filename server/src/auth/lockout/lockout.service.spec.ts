import type { AppConfig } from '../../config/app-config';
import { LockoutService } from './lockout.service';
import { MemoryLockoutStore } from './lockout.store';

const CONFIG: Record<string, number> = {
  LOCKOUT_MAX_ATTEMPTS: 3,
  LOCKOUT_ACCOUNT_MAX_ATTEMPTS: 6,
  LOCKOUT_DURATION: 900,
};

const EMAIL = 'victim@example.com';
const ATTACKER = '203.0.113.7';
const OWNER = '198.51.100.20';

function service(): LockoutService {
  const config = { get: (key: string) => CONFIG[key] } as unknown as AppConfig;
  return new LockoutService(new MemoryLockoutStore(), config);
}

async function fail(lockout: LockoutService, ip: string, times: number) {
  let last = { pairLocked: false, accountLocked: false };
  for (let i = 0; i < times; i += 1) last = await lockout.registerFailure(EMAIL, ip);
  return last;
}

describe('LockoutService', () => {
  it('locks only the failing IP, so an attacker cannot lock the owner out', async () => {
    const lockout = service();
    expect(await fail(lockout, ATTACKER, 3)).toEqual({ pairLocked: true, accountLocked: false });

    expect(await lockout.retryAfterSeconds(EMAIL, ATTACKER)).toBe(900);
    expect(await lockout.retryAfterSeconds(EMAIL, OWNER)).toBe(0);
  });

  it('locks every IP once failures across IPs reach the account-wide ceiling', async () => {
    const lockout = service();
    await fail(lockout, '203.0.113.1', 2);
    await fail(lockout, '203.0.113.2', 2);
    const outcome = await fail(lockout, '203.0.113.3', 2);

    expect(outcome).toEqual({ pairLocked: false, accountLocked: true });
    expect(await lockout.retryAfterSeconds(EMAIL, OWNER)).toBe(900);
  });

  it('a successful sign-in clears that IP only, not the account-wide count', async () => {
    const lockout = service();
    await fail(lockout, ATTACKER, 2);
    await fail(lockout, OWNER, 2);
    await lockout.reset(EMAIL, OWNER);

    // The owner's IP starts over...
    expect(await fail(lockout, OWNER, 1)).toEqual({ pairLocked: false, accountLocked: false });
    // ...but the attacker's failures still count towards the ceiling (2 + 2 + 1 + 1 = 6).
    expect(await fail(lockout, ATTACKER, 1)).toEqual({ pairLocked: true, accountLocked: true });
  });

  it('keeps emails independent', async () => {
    const lockout = service();
    await fail(lockout, ATTACKER, 3);
    expect(await lockout.retryAfterSeconds('other@example.com', ATTACKER)).toBe(0);
  });

  it('treats an unknown client IP as one shared key', async () => {
    const lockout = service();
    for (let i = 0; i < 3; i += 1) await lockout.registerFailure(EMAIL, undefined);
    expect(await lockout.retryAfterSeconds(EMAIL, undefined)).toBe(900);
    expect(await lockout.retryAfterSeconds(EMAIL, OWNER)).toBe(0);
  });
});
