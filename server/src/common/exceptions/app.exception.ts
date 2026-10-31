import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ValidationErrorDetail } from '@auth-app/shared';

/** An HTTP error carrying a stable, client-facing `ErrorCode`. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationErrorDetail[],
  ) {
    super(message, status);
  }
}
