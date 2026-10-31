import './zod-config';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { createQueryClient } from './app/query-client';
import { routes } from './app/router';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
