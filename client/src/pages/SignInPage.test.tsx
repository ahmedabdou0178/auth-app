import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from '@auth-app/shared';
import { authApi } from '../api/auth-api';
import { apiError, deferred, renderApp, USER } from '../test/render-app';

vi.mock('../api/auth-api');

beforeEach(() => {
  vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
});

async function submitSignIn(password = 'Wrong-pass1') {
  const app = renderApp('/signin');
  await screen.findByRole('heading', { name: 'Sign in' });
  await app.user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await app.user.type(screen.getByLabelText('Password'), password);
  await app.user.click(screen.getByRole('button', { name: 'Sign in' }));
  return app;
}

describe('SignInPage', () => {
  it('shows "Invalid email or password" for a 401', async () => {
    vi.mocked(authApi.signIn).mockRejectedValue(apiError(401, 'INVALID_CREDENTIALS'));
    await submitSignIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it.each(['TOO_MANY_REQUESTS', 'ACCOUNT_LOCKED'] as const)(
    'shows "Too many attempts" for a 429 (%s)',
    async (code) => {
      vi.mocked(authApi.signIn).mockRejectedValue(apiError(429, code));
      await submitSignIn();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many attempts, try again later',
      );
    },
  );

  it('shows a generic message for network errors', async () => {
    vi.mocked(authApi.signIn).mockRejectedValue(new Error('Network Error'));
    await submitSignIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('does not apply sign-up password rules', async () => {
    vi.mocked(authApi.signIn).mockRejectedValue(apiError(401, 'INVALID_CREDENTIALS'));
    await submitSignIn('x');
    expect(authApi.signIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'x' });
  });

  it('disables the button and shows progress while signing in', async () => {
    const pending = deferred<AuthResponse>();
    vi.mocked(authApi.signIn).mockReturnValue(pending.promise);
    await submitSignIn('Secr3t!pass');

    const button = await screen.findByRole('button', { name: 'Signing in' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    pending.resolve({ user: USER, csrfToken: 'csrf' });
    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
  });

  it('links to sign-up', async () => {
    renderApp('/signin');
    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });
});
