import request from 'supertest';
import type { App } from 'supertest/types';
import type { ApiError } from '@auth-app/shared';
import { createTestApp, type TestContext } from './helpers';

let ctx: TestContext;
let server: App;

beforeAll(async () => {
  ctx = await createTestApp({ TRUST_PROXY: 'false', AUTH_THROTTLE_LIMIT: '3' });
  server = ctx.app.getHttpServer();
});

afterAll(async () => {
  await ctx.close();
});

describe('rate limiting with TRUST_PROXY=false', () => {
  it('ignores a spoofed, changing X-Forwarded-For: all hits share one bucket', async () => {
    const attempt = (i: number) =>
      request(server)
        .post('/api/auth/signin')
        .set('X-Forwarded-For', `203.0.113.${String(i)}`)
        .send({ email: `spoof${String(i)}@example.com`, password: 'Wrong-pass1' });

    for (let i = 1; i <= 3; i += 1) {
      await attempt(i).expect(401);
    }
    const res = await attempt(4).expect(429);
    expect((res.body as ApiError).code).toBe('TOO_MANY_REQUESTS');
    expect((res.body as ApiError).message).toBe('Too many attempts, try again later');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not apply the strict auth limit to other routes', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(server).get('/api/users/me').expect(401);
    }
  });
});
