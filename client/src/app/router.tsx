import type { RouteObject } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { PublicOnlyRoute } from '../auth/PublicOnlyRoute';
import { HomeRedirect } from './HomeRedirect';
import { AppPage, NotFoundPage, SignInPage, SignUpPage } from './lazy-pages';
import { RootLayout } from './RootLayout';

/** The whole route tree; tests mount it in a memory router. */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: 'signup', element: <SignUpPage /> },
          { path: 'signin', element: <SignInPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [{ path: 'app', element: <AppPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
