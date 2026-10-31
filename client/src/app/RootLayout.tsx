import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { FullPageSpinner } from '../components/FullPageSpinner';

/** Inside the router, so AuthProvider can navigate (e.g. to /signin after logout). */
export function RootLayout() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}
