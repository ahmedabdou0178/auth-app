import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { ApiError, AuthResponse } from '@auth-app/shared';
import {
  cookieValue,
  createTestApp,
  ORIGIN,
  setCookies,
  STRONG_PASSWORD,
  type TestContext,
  uniqueEmail,
} from './helpers';

let ctx: TestContext;
let server: App;

beforeAll(async () => {
  ctx = await createTestApp();
  server = ctx.app.getHttpServer();
});

afterAll(async () => {
  await ctx.close();
});

interface Session {
  sid: string;
  refreshToken: string;
  csrfToken: string;
  body: AuthResponse;
}

async function signUp(email = uniqueEmail()): Promise<Session> {
  const res = await request(server)
    .post('/api/auth/signup')
    .send({ email, name: 'Ada Lovelace', password: STRONG_PASSWORD })
    .expect(201);
  const body = res.body as AuthResponse;
  return {
    sid: cookieValue(res, 'sid'),
    refreshToken: cookieValue(res, 'refresh_token'),
    csrfToken: body.csrfToken,
    body,
  };
}

function model(name: 'User' | 'Session'): Model<Record<string, unknown>> {
  return ctx.app.get<Model<Record<string, unknown>>>(getModelToken(name));
}

/** Makes a session look expired before the TTL monitor would remove it. */
async function expireSession(sid: string): Promise<void> {
  await model('Session').updateOne(
    { sessionId: sid },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
}

function refresh(cookie: string) {
  return request(server)
    .post('/api/auth/refresh')
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .set('X-Requested-With', 'fetch');
}

describe('POST /api/auth/signup', () => {
  const valid = { email: 'valid@example.com', name: 'Ada', password: STRONG_PASSWORD };

  it.each([
    ['email', { email: 'not-an-email' }, 'Enter a valid email address'],
    ['name', { name: 'Al' }, 'Name must be at least 3 characters'],
    ['password', { password: 'Sh0rt!' }, 'At least 8 characters'],
    ['password', { password: '12345678!' }, 'At least one letter'],
    ['password', { password: 'Password!' }, 'At least one number'],
    ['password', { password: 'Password1' }, 'At least one special character'],
  ])('rejects an invalid %s with field details', async (field, patch, message) => {
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ ...valid, ...patch })
      .expect(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.details).toContainEqual({ field, message });
  });

  it('creates the user, signs in and sets both httpOnly cookies', async () => {
    const res = await request(server)
      .post('/api/auth/signup')
      .send({
        email: ' New.User@Example.com ',
        name: ' Ada ',
        password: STRONG_PASSWORD,
        role: 'x',
      })
      .expect(201);

    const body = res.body as AuthResponse;
    // Exactly the whitelisted fields, normalized (email lowercased, both trimmed).
    expect(Object.keys(body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(body.user).toMatchObject({ email: 'new.user@example.com', name: 'Ada' });
    expect(body.csrfToken).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|accessToken/);

    const cookies = setCookies(res);
    expect(cookies.get('sid')?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', 'path=/api']),
    );
    expect(cookies.get('refresh_token')?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', 'path=/api/auth']),
    );
  });

  it('returns 409 for an email registered with different casing', async () => {
    const email = uniqueEmail('dup');
    await signUp(email);
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ email: email.toUpperCase(), name: 'Other', password: STRONG_PASSWORD })
      .expect(409);
    expect((res.body as ApiError).code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/signin', () => {
  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const email = uniqueEmail('signin');
    await signUp(email);

    const wrongPassword = await request(server)
      .post('/api/auth/signin')
      .send({ email, password: 'Wrong-pass1' })
      .expect(401);
    const unknownEmail = await request(server)
      .post('/api/auth/signin')
      .send({ email: uniqueEmail('ghost'), password: 'Wrong-pass1' })
      .expect(401);

    const withoutRequestId = (body: ApiError) => ({ ...body, requestId: '' });
    expect(withoutRequestId(wrongPassword.body as ApiError)).toEqual(
      withoutRequestId(unknownEmail.body as ApiError),
    );
    expect((wrongPassword.body as ApiError).message).toBe('Invalid email or password');
  });

  it('validates the body with the sign-in schema (400 with field details)', async () => {
    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
    const body = res.body as ApiError;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([
        { field: 'email', message: 'Enter a valid email address' },
        { field: 'password', message: 'Password is required' },
      ]),
    );
  });

  it('signs in with the right password', async () => {
    const email = uniqueEmail('ok');
    await signUp(email);
    const res = await request(server)
      .post('/api/auth/signin')
      .send({ email, password: STRONG_PASSWORD })
      .expect(200);
    expect(setCookies(res).has('sid')).toBe(true);
    expect((res.body as AuthResponse).user.email).toBe(email);
  });
});

describe('GET /api/users/me', () => {
  it('returns 401 without a session', async () => {
    const res = await request(server).get('/api/users/me').expect(401);
    expect((res.body as ApiError).code).toBe('INVALID_SESSION');
  });

  it('returns the user and CSRF token with a session', async () => {
    const session = await signUp();
    const res = await request(server)
      .get('/api/users/me')
      .set('Cookie', `sid=${session.sid}`)
      .expect(200);
    expect(res.body).toEqual({ user: session.body.user, csrfToken: session.csrfToken });
  });

  it('rejects a JSON-object cookie instead of passing it to Mongo', async () => {
    await request(server).get('/api/users/me').set('Cookie', 'sid=j:{"$ne":null}').expect(401);
  });

  it('rejects an expired session', async () => {
    const session = await signUp();
    await expireSession(session.sid);
    await request(server).get('/api/users/me').set('Cookie', `sid=${session.sid}`).expect(401);
  });

  it('rejects a session whose user no longer exists', async () => {
    const session = await signUp();
    await model('User').deleteOne({ email: session.body.user.email });
    const res = await request(server)
      .get('/api/users/me')
      .set('Cookie', `sid=${session.sid}`)
      .expect(401);
    expect((res.body as ApiError).code).toBe('INVALID_SESSION');
  });
});

describe('CSRF', () => {
  it('rejects logout with a session but no or a wrong X-CSRF-Token', async () => {
    const session = await signUp();
    const cookie = `sid=${session.sid}; refresh_token=${session.refreshToken}`;
    for (const token of [undefined, 'wrong-token']) {
      const req = request(server).post('/api/auth/logout').set('Cookie', cookie);
      const res = await (token ? req.set('X-CSRF-Token', token) : req).expect(403);
      expect((res.body as ApiError).code).toBe('INVALID_CSRF_TOKEN');
    }
    // Still signed in: the forged requests did nothing.
    await request(server).get('/api/users/me').set('Cookie', `sid=${session.sid}`).expect(200);
  });

  it('rejects refresh without the Origin and X-Requested-With headers', async () => {
    const session = await signUp();
    const cookie = `refresh_token=${session.refreshToken}`;
    await request(server).post('/api/auth/refresh').set('Cookie', cookie).expect(403);
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .set('X-Requested-With', 'fetch')
      .expect(403);
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(403);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new session without rotating the refresh token', async () => {
    const session = await signUp();
    const res = await refresh(`sid=${session.sid}; refresh_token=${session.refreshToken}`).expect(
      200,
    );

    const newSid = cookieValue(res, 'sid');
    expect(newSid).not.toBe(session.sid);
    expect(setCookies(res).has('refresh_token')).toBe(false);
    const body = res.body as AuthResponse;
    expect(body.csrfToken).not.toBe(session.csrfToken);
    expect(body.user).toEqual(session.body.user);

    await request(server).get('/api/users/me').set('Cookie', `sid=${session.sid}`).expect(401);
    await request(server).get('/api/users/me').set('Cookie', `sid=${newSid}`).expect(200);

    // Not rotated: the same refresh token keeps working.
    await refresh(`refresh_token=${session.refreshToken}`).expect(200);
  });

  it('returns 401 and clears cookies for an unknown or missing refresh token', async () => {
    const unknown = await refresh('refresh_token=unknown-token').expect(401);
    expect((unknown.body as ApiError).code).toBe('INVALID_REFRESH_TOKEN');
    expect(setCookies(unknown).get('refresh_token')?.value).toBe('');
    await refresh('').expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token, ends every session it created and clears cookies', async () => {
    const session = await signUp();
    const second = await refresh(`refresh_token=${session.refreshToken}`).expect(200);
    const secondSid = cookieValue(second, 'sid');

    const res = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', `sid=${session.sid}; refresh_token=${session.refreshToken}`)
      .set('X-CSRF-Token', session.csrfToken)
      .expect(204);
    expect(setCookies(res).get('sid')?.value).toBe('');
    expect(setCookies(res).get('refresh_token')?.value).toBe('');

    await request(server).get('/api/users/me').set('Cookie', `sid=${session.sid}`).expect(401);
    await request(server).get('/api/users/me').set('Cookie', `sid=${secondSid}`).expect(401);
    await refresh(`refresh_token=${session.refreshToken}`).expect(401);
  });

  it('works after the session expired: revokes the refresh token via Origin + X-Requested-With', async () => {
    const session = await signUp();
    await expireSession(session.sid);
    const cookie = `sid=${session.sid}; refresh_token=${session.refreshToken}`;

    // No session any more, so the CSRF token can't be checked: Origin + custom header are required.
    await request(server).post('/api/auth/logout').set('Cookie', cookie).expect(403);
    await request(server)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'fetch')
      .expect(204);

    await refresh(`refresh_token=${session.refreshToken}`).expect(401);
  });

  it('is idempotent without cookies', async () => {
    await request(server)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'fetch')
      .expect(204);
  });
});

describe('errors and hardening', () => {
  it('returns 400 for malformed JSON and 413 for an oversized body, with a request ID', async () => {
    const malformed = await request(server)
      .post('/api/auth/signin')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect((malformed.body as ApiError).code).toBe('BAD_REQUEST');

    const tooLarge = await request(server)
      .post('/api/auth/signin')
      .send({ email: 'a@example.com', password: 'x'.repeat(20_000) })
      .expect(413);
    expect((tooLarge.body as ApiError).code).toBe('PAYLOAD_TOO_LARGE');
    expect(tooLarge.headers['x-request-id']).toBe((tooLarge.body as ApiError).requestId);
  });

  it('reuses a well-formed X-Request-Id and replaces a malformed one', async () => {
    const kept = await request(server)
      .get('/api/nope')
      .set('X-Request-Id', 'trace-123')
      .expect(404);
    expect((kept.body as ApiError).requestId).toBe('trace-123');
    const replaced = await request(server)
      .get('/api/nope')
      .set('X-Request-Id', 'bad id!')
      .expect(404);
    expect((replaced.body as ApiError).requestId).not.toBe('bad id!');
  });

  it('sends Cache-Control: no-store and security headers', async () => {
    const res = await request(server).get('/api/users/me');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('paths outside /api', () => {
  it.each([
    ['get', '/'],
    ['post', '/latest/meta-data/'],
  ] as const)('%s %s returns the JSON 404 error', async (method, path) => {
    const res = await request(server)[method](path).expect(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect((res.body as ApiError).code).toBe('NOT_FOUND');
  });
});

describe('GET /api/health', () => {
  it('is public and reports MongoDB up', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', info: { mongodb: { status: 'up' } } });
  });
});
