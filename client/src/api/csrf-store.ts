/**
 * The session's synchronizer CSRF token, held in memory only (never Web Storage).
 * Module-scoped so the axios interceptor reads it synchronously and a background refresh can
 * replace it without re-rendering. Lost on reload; GET /users/me returns it again.
 */
let token: string | null = null;

export const csrfStore = {
  get: (): string | null => token,
  set: (value: string): void => {
    token = value;
  },
  clear: (): void => {
    token = null;
  },
};
