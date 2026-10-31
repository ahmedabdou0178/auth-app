import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { apiError, renderApp, USER } from '../test/render-app';

vi.mock('../api/auth-api');

beforeEach(() => {
  vi.mocked(authApi.me).mockRejectedValue(apiError(401, 'INVALID_SESSION'));
});

async function openSignUp() {
  const app = renderApp('/signup');
  await screen.findByRole('heading', { name: 'Create your account' });
  return app;
}

function checklistItem(id: string): HTMLElement {
  const item = document.querySelector<HTMLElement>(`[data-rule="${id}"]`);
  if (!item) throw new Error(`No checklist item ${id}`);
  return item;
}

describe('SignUpPage', () => {
  it('shows a validation message for every field on submit', async () => {
    const { user } = await openSignUp();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Name must be at least 3 characters')).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(authApi.signUp).not.toHaveBeenCalled();
  });

  it.each([
    ['Sh0rt!', 'At least 8 characters'],
    ['12345678!', 'At least one letter'],
    ['Password!', 'At least one number'],
    ['Password1', 'At least one special character'],
  ])('shows the password error for %s', async (password, message) => {
    const { user } = await openSignUp();
    await user.type(screen.getByLabelText('Password'), password);
    await user.tab();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.closest('div.space-y-1\\.5')).toHaveTextContent(message);
  });

  it('updates the checklist live as the user types', async () => {
    const { user } = await openSignUp();
    const password = screen.getByLabelText('Password');
    expect(checklistItem('minLength')).toHaveAttribute('data-met', 'false');

    await user.type(password, 'abc');
    expect(checklistItem('letter')).toHaveAttribute('data-met', 'true');
    expect(checklistItem('number')).toHaveAttribute('data-met', 'false');

    await user.type(password, '12345!');
    for (const id of ['minLength', 'letter', 'number', 'special']) {
      expect(checklistItem(id)).toHaveAttribute('data-met', 'true');
    }
    expect(within(checklistItem('special')).getByText('(met)')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const { user } = await openSignUp();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('shows "Email is already registered" on the email field for a 409', async () => {
    vi.mocked(authApi.signUp).mockRejectedValue(apiError(409, 'EMAIL_TAKEN'));
    const { user } = await openSignUp();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Password'), 'Secr3t!pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription(
      'Email is already registered',
    );
  });

  it('signs up with normalized values and lands on the app page', async () => {
    vi.mocked(authApi.signUp).mockResolvedValue({ user: USER, csrfToken: 'csrf' });
    const { user, router } = await openSignUp();
    await user.type(screen.getByLabelText('Email'), '  Ada@Example.COM ');
    await user.type(screen.getByLabelText('Name'), ' Ada Lovelace ');
    await user.type(screen.getByLabelText('Password'), 'Secr3t!pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', { name: 'Welcome to the application.' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
    expect(authApi.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      password: 'Secr3t!pass',
    });
  });
});
