import { QueryClient } from '@tanstack/react-query';
import { isClientError } from '../api/errors';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 4xx won't change on retry (401s are already handled by the refresh interceptor).
        retry: (failureCount, error) => !isClientError(error) && failureCount < MAX_RETRIES,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
