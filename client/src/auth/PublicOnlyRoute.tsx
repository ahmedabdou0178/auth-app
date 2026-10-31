import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useAuth } from './useAuth';

/** Only same-app paths: `//evil.example` or absolute URLs would be an open redirect. */
function safeReturnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/app';
}

/**
 * Sign-in / sign-up: signed-in users go to the app, or back to the protected page that sent
 * them here. This is also what moves the user on after a successful sign-in or sign-up.
 */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeReturnPath(location.state)} replace />;
  }
  return <Outlet />;
}
