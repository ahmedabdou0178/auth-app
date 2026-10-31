import { type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { ErrorCode } from '@auth-app/shared';
import { AppException } from '../exceptions/app.exception.js';
import { TOO_MANY_REQUESTS_MESSAGE } from './throttler.options.js';

/**
 * Same limits as the stock guard, but every 429 carries the standard `Retry-After` header
 * (named throttlers otherwise only send `Retry-After-<name>`) and the `TOO_MANY_REQUESTS` code.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = Math.max(detail.timeToBlockExpire, 1);
    return Promise.reject(
      new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_REQUESTS,
        TOO_MANY_REQUESTS_MESSAGE,
        undefined,
        { 'Retry-After': String(retryAfter) },
      ),
    );
  }
}
