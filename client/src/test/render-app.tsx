import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ApiError, ErrorCode, UserDto } from '@auth-app/shared';
import { createQueryClient } from '../app/query-client';
import { routes } from '../app/router';

export const USER: UserDto = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: '2026-10-31T12:00:00.000Z',
};

/** Mounts the real route tree (and real AuthProvider) at `path`. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, user };
}

/** An axios error carrying an API error body, as the real client would reject with. */
export function apiError(status: number, code: ErrorCode, message = 'error'): AxiosError {
  const data: ApiError = {
    statusCode: status,
    error: 'Error',
    message,
    code,
    requestId: 'req-1',
  };
  const response = {
    status,
    statusText: 'Error',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse<ApiError>;
  return new AxiosError(message, String(status), response.config, undefined, response);
}

/** A promise you resolve later, to observe pending states. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
