import { lazy } from 'react';

// Each page is its own chunk: the first load fetches only the shell plus the page opened.
export const SignUpPage = lazy(() => import('../pages/SignUpPage'));
export const SignInPage = lazy(() => import('../pages/SignInPage'));
export const AppPage = lazy(() => import('../pages/AppPage'));
export const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
