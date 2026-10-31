import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@auth-app/shared';
import { authApi } from '../api/auth-api';
import { csrfStore } from '../api/csrf-store';
import { apiError, deferred, renderApp, USER } from '../test/render-app';

vi.mock('../api/auth-api');

const WELCOME = { name: 'Welcome to the application.' };

describe('ProtectedRoute', () => {
  it('redirects to /signin without a session', async () => {
    vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
    const { router } = renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('shows the loading state, never protected content, while the session restores', async () => {
    const pending = deferred<MeResponse>();
    vi.mocked(authApi.me).mockReturnValue(pending.promise);
    renderApp('/app');

    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByRole('heading', WELCOME)).not.toBeInTheDocument();

    pending.resolve({ user: USER, csrfToken: 'csrf-1' });
    expect(await screen.findByRole('heading', WELCOME)).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(csrfStore.get()).toBe('csrf-1');
  });

  it('returns to the requested page after signing in', async () => {
    vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
    vi.mocked(authApi.signIn).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    const { user, router } = renderApp('/app');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secr3t!pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', WELCOME)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });
});

describe('PublicOnlyRoute', () => {
  it('sends a signed-in user from /signin to /app', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    const { router } = renderApp('/signin');
    expect(await screen.findByRole('heading', WELCOME)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('ignores an off-site return path', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    const { router } = renderApp('/signin');
    await router.navigate('/signin', { state: { from: '//evil.example' } });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app');
    });
  });
});

describe('AppPage', () => {
  it('logs out: calls the API, clears the CSRF token and goes to /signin', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const { user, router } = renderApp('/app');
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(csrfStore.get()).toBeNull();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('stays signed in and says so when the logout request fails', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    vi.mocked(authApi.logout).mockRejectedValue(new Error('Network Error'));
    const { user, router } = renderApp('/app');
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't log out");
    expect(router.state.location.pathname).toBe('/app');
    expect(csrfStore.get()).toBe('csrf');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled();
  });
});

describe('/ and unknown paths', () => {
  it('redirects / by session state', async () => {
    vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
    const { router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('shows a 404 page', async () => {
    vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
