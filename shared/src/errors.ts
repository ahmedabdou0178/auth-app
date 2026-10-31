export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_SESSION: 'INVALID_SESSION',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_CSRF_TOKEN: 'INVALID_CSRF_TOKEN',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/** Body of every error response from the API. */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code: ErrorCode;
  requestId: string;
  details?: ValidationErrorDetail[];
}
