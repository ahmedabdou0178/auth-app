import request from 'supertest';
import type { App } from 'supertest/types';
import type { ApiError } from '@auth-app/shared';
import { createTestApp, STRONG_PASSWORD, type TestContext, uniqueEmail } from './helpers';

// setup-env.ts sets LOCKOUT_MAX_ATTEMPTS=3 (per email + IP), LOCKOUT_ACCOUNT_MAX_ATTEMPTS=6
// (per email, all IPs), LOCKOUT_DURATION=15m and TRUST_PROXY=1, so X-Forwarded-For sets the IP.
let ctx: TestContext;
let server: App;

beforeAll(async () => {
  ctx = await createTestApp();
  server = ctx.app.getHttpServer();
});

afterAll(async () => {
  await ctx.close();
});

async function register(): Promise<string> {
  const email = uniqueEmail('lock');
  await request(server)
    .post('/api/auth/signup')
    .send({ email, name: 'Ada', password: STRONG_PASSWORD })
    .expect(201);
  return email;
}

const DEFAULT_IP = '192.0.2.10';

function signIn(email: string, password: string, ip = DEFAULT_IP) {
  return request(server)
    .post('/api/auth/signin')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
}

async function failTimes(email: string, times: number, ip = DEFAULT_IP): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await signIn(email, 'Wrong-pass1', ip).expect(401);
  }
}

describe('account lockout', () => {
  it('locks after 3 failures, even for the right password, with Retry-After', async () => {
    const email = await register();
    await failTimes(email, 3);

    const res = await signIn(email, STRONG_PASSWORD).expect(429);
    expect((res.body as ApiError).code).toBe('ACCOUNT_LOCKED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(890);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(900);
  });

  it('locks unknown emails exactly like real ones', async () => {
    const ghost = uniqueEmail('ghost');
    await failTimes(ghost, 3);
    const res = await signIn(ghost, 'Wrong-pass1').expect(429);
    expect((res.body as ApiError).code).toBe('ACCOUNT_LOCKED');
  });

  it('resets the count after a successful sign-in', async () => {
    const email = await register();
    await failTimes(email, 2);
    await signIn(email, STRONG_PASSWORD).expect(200);
    await failTimes(email, 2);
    await signIn(email, STRONG_PASSWORD).expect(200);
  });

  it('does not lock the owner out when another IP fails on purpose', async () => {
    const email = await register();
    await failTimes(email, 3, '203.0.113.66');
    await signIn(email, STRONG_PASSWORD, '203.0.113.66').expect(429);

    await signIn(email, STRONG_PASSWORD, '198.51.100.20').expect(200);
  });

  it('locks every IP once failures from several IPs reach the account-wide ceiling', async () => {
    const email = await register();
    await failTimes(email, 2, '203.0.113.1');
    await failTimes(email, 2, '203.0.113.2');
    await failTimes(email, 2, '203.0.113.3');

    const res = await signIn(email, STRONG_PASSWORD, '198.51.100.20').expect(429);
    expect((res.body as ApiError).code).toBe('ACCOUNT_LOCKED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(890);
  });

  it('does not affect other emails', async () => {
    const locked = await register();
    const other = await register();
    await failTimes(locked, 3);
    await signIn(other, STRONG_PASSWORD).expect(200);
  });
});
