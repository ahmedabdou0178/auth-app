import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { FullPageSpinner } from '../components/FullPageSpinner';

export function HomeRedirect() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  return <Navigate to={status === 'authenticated' ? '/app' : '/signin'} replace />;
}
