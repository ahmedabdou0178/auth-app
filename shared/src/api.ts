export interface UserDto {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** Returned by sign-up, sign-in and refresh; the session itself travels in httpOnly cookies. */
export interface AuthResponse {
  user: UserDto;
  csrfToken: string;
}

/** `GET /users/me` also returns the CSRF token so the client can recover it after a reload. */
export type MeResponse = AuthResponse;

/** Synchronizer CSRF token header, required on unsafe requests that carry a session. */
export const CSRF_HEADER = 'x-csrf-token';
/** Custom header that forces a CORS preflight on session-less cookie routes. */
export const REQUESTED_WITH_HEADER = 'x-requested-with';
export const REQUESTED_WITH_VALUE = 'fetch';
