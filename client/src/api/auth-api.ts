import type { AuthResponse, MeResponse, SignInInput, SignUpInput } from '@auth-app/shared';
import { api } from './client';

/** Typed API calls (tests mock this module). */
export const authApi = {
  signUp: (input: SignUpInput) =>
    api.post<AuthResponse>('/auth/signup', input).then(({ data }) => data),
  signIn: (input: SignInInput) =>
    api.post<AuthResponse>('/auth/signin', input).then(({ data }) => data),
  logout: () => api.post('/auth/logout').then(() => undefined),
  me: () => api.get<MeResponse>('/users/me').then(({ data }) => data),
};
