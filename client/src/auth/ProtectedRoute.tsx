import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { useAuth } from './useAuth';

/** Signed-in users only. Never renders protected content while the session is restoring. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'unauthenticated') {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
