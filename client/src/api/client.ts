import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  type AuthResponse,
  CSRF_HEADER,
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

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || error.response?.status !== 401 || !error.config) {
    throw error;
  }
  const config: RetriableConfig = error.config;
  const url = config.url ?? '';
  if (config._retried || AUTH_ENDPOINTS.some((path) => url.startsWith(path))) {
    throw error;
  }

  config._retried = true;
  const refreshed = await refreshSession();
  if (!refreshed) {
    sessionExpiredHandler();
    throw error;
  }
  // The request interceptor attaches the new CSRF token.
  return api(config);
});
