import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AuthResponse, SignInInput, SignUpInput, UserDto } from '@auth-app/shared';
import { authApi } from '../api/auth-api';
import { setSessionExpiredHandler } from '../api/client';
import { csrfStore } from '../api/csrf-store';
import { httpStatus } from '../api/errors';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

/**
 * Restores the session on load: GET /users/me with the session cookie. When that 401s the
 * axios interceptor refreshes from the refresh cookie and retries; null means signed out.
 */
async function restoreSession(): Promise<UserDto | null> {
  try {
    const { user, csrfToken } = await authApi.me();
    csrfStore.set(csrfToken);
    return user;
  } catch (error) {
    if (httpStatus(error) === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // One query = one restore request, even under StrictMode's double effects.
  const session = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: restoreSession,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    setSessionExpiredHandler(() => {
      csrfStore.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    });
    return () => {
      setSessionExpiredHandler(() => undefined);
    };
  }, [queryClient]);

  const establish = useCallback(
    ({ user, csrfToken }: AuthResponse) => {
      csrfStore.set(csrfToken);
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (input: SignInInput) => {
      establish(await authApi.signIn(input));
    },
    [establish],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      establish(await authApi.signUp(input));
    },
    [establish],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      csrfStore.clear();
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      void navigate('/signin', { replace: true });
    }
  }, [queryClient, navigate]);

  const user = session.data ?? null;
  const status: AuthStatus = session.isPending
    ? 'loading'
    : user
      ? 'authenticated'
      : 'unauthenticated';

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signUp, logout }),
    [user, status, signIn, signUp, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
