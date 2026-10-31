import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  type AuthResponse,
  CSRF_HEADER,
  ErrorCode,
  type MeResponse,
  REQUESTED_WITH_HEADER,
  REQUESTED_WITH_VALUE,
} from '@auth-app/shared';
import { csrfStore } from './csrf-store';

/**
 * The single HTTP client. Cookies (session + refresh token) are httpOnly and sent by the
 * browser; JavaScript only ever handles the CSRF token.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  // Forces a CORS preflight cross-origin; the API requires it on session-less cookie routes.
  headers: { [REQUESTED_WITH_HEADER]: REQUESTED_WITH_VALUE },
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);
/** A 401 from these means "wrong credentials" or "refresh failed", never "try refreshing". */
const AUTH_ENDPOINTS = ['/auth/signin', '/auth/signup', '/auth/refresh', '/auth/logout'];
/** Its 403 comes from the Origin + X-Requested-With check, which a fresh token can't fix. */
const REFRESH_ENDPOINT = '/auth/refresh';

api.interceptors.request.use((config) => {
  const token = csrfStore.get();
  if (token && !SAFE_METHODS.has((config.method ?? 'get').toLowerCase())) {
    config.headers.set(CSRF_HEADER, token);
  }
  return config;
});

let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * Starts a new session from the refresh cookie. Concurrent callers share one request: the
 * refresh token doesn't rotate, so parallel refreshes would be harmless but wasteful (each
 * creates a session). Resolves to null when the refresh token is gone or invalid.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= api
    .post<AuthResponse>('/auth/refresh')
    .then(
      ({ data }) => {
        csrfStore.set(data.csrfToken);
        return data;
      },
      () => {
        csrfStore.clear();
        return null;
      },
    )
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

let sessionExpiredHandler: () => void = () => undefined;

/** Called when a request got 401 and the refresh failed too (AuthProvider signs the user out). */
export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

let csrfSyncInFlight: Promise<boolean> | null = null;

/**
 * Re-reads the CSRF token of the session the browser currently holds. Tabs share the `sid`
 * cookie but each keeps its own in-memory token, so after another tab refreshed or signed in
 * again, this tab's token belongs to a replaced session. Concurrent callers share one request.
 * Resolves to false when there is no session any more (the 401 path has handled that).
 */
export function syncCsrfToken(): Promise<boolean> {
  csrfSyncInFlight ??= api
    .get<MeResponse>('/users/me')
    .then(
      ({ data }) => {
        csrfStore.set(data.csrfToken);
        return true;
      },
      () => false,
    )
    .finally(() => {
      csrfSyncInFlight = null;
    });
  return csrfSyncInFlight;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  _csrfRetried?: boolean;
}

function isCsrfRejection(error: AxiosError): boolean {
  const data = error.response?.data as { code?: unknown } | undefined;
  return error.response?.status === 403 && data?.code === ErrorCode.INVALID_CSRF_TOKEN;
}

/** 403 INVALID_CSRF_TOKEN: fetch the current session's token, then retry once. */
async function retryWithCurrentCsrfToken(error: AxiosError, config: RetriableConfig) {
  if (config._csrfRetried || (config.url ?? '').startsWith(REFRESH_ENDPOINT)) throw error;
  config._csrfRetried = true;
  if (!(await syncCsrfToken())) throw error;
  // The request interceptor attaches the token just read.
  return api(config);
}

/** 401 from a non-auth endpoint: refresh the session once, then retry once. */
async function retryWithRefreshedSession(error: AxiosError, config: RetriableConfig) {
  const url = config.url ?? '';
  if (config._retried || AUTH_ENDPOINTS.some((path) => url.startsWith(path))) throw error;
  config._retried = true;
  const refreshed = await refreshSession();
  if (!refreshed) {
    sessionExpiredHandler();
    throw error;
  }
  // The request interceptor attaches the new CSRF token.
  return api(config);
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || !error.config) throw error;
  const config: RetriableConfig = error.config;
  if (isCsrfRejection(error)) return retryWithCurrentCsrfToken(error, config);
  if (error.response?.status === 401) return retryWithRefreshedSession(error, config);
  throw error;
});
