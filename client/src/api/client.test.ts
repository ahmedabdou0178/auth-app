import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, refreshSession, setSessionExpiredHandler } from './client';
import { csrfStore } from './csrf-store';

interface Call {
  method: string;
  url: string;
  csrf: string | undefined;
  requestedWith: string | undefined;
}

/**
 * Fake server behind the real axios instance: `/users/me` accepts only `validSid`, refresh
 * issues a new sid + CSRF token while the refresh token is valid. With `enforceCsrf`, unsafe
 * requests (except sign-in/sign-up/refresh) need the current session's token, like the API.
 */
function fakeServer() {
  const state = {
    validSid: 'sid-0',
    sid: 'sid-0',
    refreshValid: true,
    refreshes: 0,
    csrf: 'csrf-0',
    enforceCsrf: false,
  };
  const calls: Call[] = [];

  const respond = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const response = { status, statusText: String(status), data, headers: {}, config };
    if (status >= 400) {
      return Promise.reject(new AxiosError('fail', String(status), config, undefined, response));
    }
    return Promise.resolve(response);
  };

  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? '';
    calls.push({
      method: (config.method ?? 'get').toUpperCase(),
      url,
      csrf: config.headers.get('x-csrf-token') as string | undefined,
      requestedWith: config.headers.get('x-requested-with') as string | undefined,
    });
    await Promise.resolve();

    if (url === '/auth/refresh') {
      if (!state.refreshValid) return respond(config, 401, { code: 'INVALID_REFRESH_TOKEN' });
      state.refreshes += 1;
      state.validSid = `sid-${String(state.refreshes)}`;
      state.sid = state.validSid;
      state.csrf = `csrf-${String(state.refreshes)}`;
      return respond(config, 200, { user: { id: 'u1' }, csrfToken: state.csrf });
    }
    if (url === '/auth/signin') return respond(config, 401, { code: 'INVALID_CREDENTIALS' });
    if (state.sid !== state.validSid) return respond(config, 401, { code: 'INVALID_SESSION' });
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes((config.method ?? 'get').toUpperCase());
    if (state.enforceCsrf && unsafe && config.headers.get('x-csrf-token') !== state.csrf) {
      return respond(config, 403, { statusCode: 403, code: 'INVALID_CSRF_TOKEN' });
    }
    if (url === '/users/me')
      return respond(config, 200, { user: { id: 'u1' }, csrfToken: state.csrf });
    return respond(config, 200, { ok: true });
  };

  return { state, calls, adapter };
}

let server: ReturnType<typeof fakeServer>;
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  server = fakeServer();
  api.defaults.adapter = server.adapter;
  csrfStore.clear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setSessionExpiredHandler(() => undefined);
});

describe('api client', () => {
  it('sends X-Requested-With on every request and the CSRF token only on unsafe methods', async () => {
    csrfStore.set('csrf-0');
    await api.get('/users/me');
    await api.post('/items', {});

    expect(server.calls).toEqual([
      { method: 'GET', url: '/users/me', csrf: undefined, requestedWith: 'fetch' },
      { method: 'POST', url: '/items', csrf: 'csrf-0', requestedWith: 'fetch' },
    ]);
  });

  it('refreshes once for concurrent 401s, then retries each request once', async () => {
    server.state.sid = 'expired';
    const results = await Promise.all([api.get('/a'), api.get('/b'), api.post('/c')]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(server.calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
    for (const url of ['/a', '/b', '/c']) {
      expect(server.calls.filter((c) => c.url === url)).toHaveLength(2);
    }
  });

  it('replaces the CSRF token after a refresh and uses it on the retry', async () => {
    csrfStore.set('csrf-old');
    server.state.sid = 'expired';
    await api.post('/c');

    expect(csrfStore.get()).toBe('csrf-1');
    const posts = server.calls.filter((c) => c.url === '/c');
    expect(posts.map((c) => c.csrf)).toEqual(['csrf-old', 'csrf-1']);
  });

  it('clears the token and reports an expired session when the refresh fails', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    csrfStore.set('csrf-old');
    server.state.sid = 'expired';
    server.state.refreshValid = false;

    await expect(api.get('/users/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(csrfStore.get()).toBeNull();
    expect(server.calls.filter((c) => c.url === '/users/me')).toHaveLength(1);
  });

  it('does not refresh for a 401 from an auth endpoint', async () => {
    await expect(api.post('/auth/signin', {})).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(server.calls.map((c) => c.url)).toEqual(['/auth/signin']);
  });

  it('retries at most once', async () => {
    server.state.sid = 'expired';
    // The refresh "succeeds" but the session stays invalid.
    const adapter = server.adapter;
    api.defaults.adapter = async (config) => {
      const response = await adapter(config);
      if (config.url === '/auth/refresh') server.state.sid = 'still-expired';
      return response;
    };

    await expect(api.get('/a')).rejects.toMatchObject({ response: { status: 401 } });
    expect(server.calls.filter((c) => c.url === '/a')).toHaveLength(2);
    expect(server.calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
  });

  it('shares one in-flight refresh between direct callers too', async () => {
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a).toEqual(b);
    expect(server.state.refreshes).toBe(1);
  });

  describe('another tab replaced the session (shared sid cookie, per-tab CSRF token)', () => {
    beforeEach(() => {
      server.state.enforceCsrf = true;
      // This tab still holds the token of the session another tab has since replaced.
      csrfStore.set('csrf-stale');
      server.state.csrf = 'csrf-from-other-tab';
    });

    it('re-reads the current token after a 403 INVALID_CSRF_TOKEN and retries logout once', async () => {
      const res = await api.post('/auth/logout');

      expect(res.status).toBe(200);
      expect(csrfStore.get()).toBe('csrf-from-other-tab');
      expect(server.calls.map((c) => `${c.method} ${c.url} ${String(c.csrf)}`)).toEqual([
        'POST /auth/logout csrf-stale',
        'GET /users/me undefined',
        'POST /auth/logout csrf-from-other-tab',
      ]);
    });

    it('shares one token re-read between concurrent 403s', async () => {
      await Promise.all([api.post('/a'), api.post('/b')]);
      expect(server.calls.filter((c) => c.url === '/users/me')).toHaveLength(1);
    });

    it('retries at most once when the token is still rejected', async () => {
      // The server keeps rotating its token, so the re-read one is stale again.
      const adapter = server.adapter;
      api.defaults.adapter = async (config) => {
        const response = await adapter(config);
        if (config.url === '/users/me') server.state.csrf = 'csrf-rotated-again';
        return response;
      };

      await expect(api.post('/auth/logout')).rejects.toMatchObject({ response: { status: 403 } });
      expect(server.calls.filter((c) => c.url === '/auth/logout')).toHaveLength(2);
    });

    it('does not re-read the token for a 403 from /auth/refresh (Origin check, not the token)', async () => {
      const adapter = server.adapter;
      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/refresh') {
          const response = {
            status: 403,
            statusText: '403',
            data: { code: 'INVALID_CSRF_TOKEN' },
            headers: {},
            config,
          };
          throw new AxiosError('fail', '403', config, undefined, response);
        }
        return adapter(config);
      };

      expect(await refreshSession()).toBeNull();
      expect(server.calls.filter((c) => c.url === '/users/me')).toHaveLength(0);
    });

    it('does not retry other 403s', async () => {
      const adapter = server.adapter;
      api.defaults.adapter = async (config) => {
        if (config.url === '/forbidden') {
          const response = {
            status: 403,
            statusText: '403',
            data: { code: 'BAD_REQUEST' },
            headers: {},
            config,
          };
          throw new AxiosError('fail', '403', config, undefined, response);
        }
        return adapter(config);
      };

      await expect(api.post('/forbidden')).rejects.toMatchObject({ response: { status: 403 } });
      expect(server.calls).toHaveLength(0);
    });
  });
});
