import RedisMock from 'ioredis-mock';
import request from 'supertest';
import type { App } from 'supertest/types';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { createTestApp, STRONG_PASSWORD, type TestContext, setCookies } from './helpers';

const PROD_ORIGIN = 'https://app.example.com';

let ctx: TestContext;
let server: App;

beforeAll(async () => {
  ctx = await createTestApp(
    {
      NODE_ENV: 'production',
      CORS_ORIGIN: PROD_ORIGIN,
      COOKIE_SECURE: 'true',
      // Required in production; the client itself is replaced by an in-memory mock below.
      REDIS_URL: 'redis://redis.invalid:6379',
    },
    (builder) => builder.overrideProvider(REDIS_CLIENT).useValue(new RedisMock()),
  );
  server = ctx.app.getHttpServer();
});

afterAll(async () => {
  await ctx.close();
});

describe('production settings', () => {
  it('marks both cookies Secure', async () => {
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'prod@example.com', name: 'Ada', password: STRONG_PASSWORD })
      .expect(201);
    const cookies = setCookies(res);
    expect(cookies.get('sid')?.attributes).toContain('secure');
    expect(cookies.get('refresh_token')?.attributes).toContain('secure');
  });

  it('allows exactly the configured origin in CORS preflights', async () => {
    const allowed = await request(server)
      .options('/api/auth/refresh')
      .set('Origin', PROD_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-requested-with,x-csrf-token');
    expect(allowed.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(server)
      .options('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    // A fixed origin is always announced, never echoed back, so the browser blocks the caller.
    expect(other.headers['access-control-allow-origin']).toBe(PROD_ORIGIN);
  });

  it('does not serve Swagger', async () => {
    await request(server).get('/api/docs').expect(404);
    await request(server).get('/api/docs-json').expect(404);
  });

  it('reports Redis in the health check', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ info: { redis: { status: 'up' } } });
  });
});
