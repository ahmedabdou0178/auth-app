import { AxiosError } from 'axios';
import type { ApiError } from '@auth-app/shared';

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<ApiError>).code === 'string' &&
    typeof (value as Partial<ApiError>).statusCode === 'number'
  );
}

/** The API's error body, or null for network errors and non-API responses. */
export function toApiError(error: unknown): ApiError | null {
  if (error instanceof AxiosError && isApiError(error.response?.data)) {
    return error.response.data;
  }
  return null;
}

export function httpStatus(error: unknown): number | undefined {
  return error instanceof AxiosError ? error.response?.status : undefined;
}

export function isClientError(error: unknown): boolean {
  const status = httpStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}
