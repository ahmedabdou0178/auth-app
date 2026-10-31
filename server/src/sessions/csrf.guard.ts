import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  CSRF_HEADER,
  ErrorCode,
  REQUESTED_WITH_HEADER,
  REQUESTED_WITH_VALUE,
} from '@auth-app/shared';
import { AppException } from '../common/exceptions/app.exception.js';
import { AppConfig } from '../config/app-config.js';
import { CSRF_MODE_KEY, type CsrfMode } from './decorators.js';
import { safeEqual } from './tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard, runs after `SessionGuard`. Unsafe requests must prove they come from our app:
 * with a session, by echoing its synchronizer token; without one (refresh, logout after expiry),
 * by a matching `Origin` plus a custom header that forces a CORS preflight.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const mode = this.reflector.getAllAndOverride<CsrfMode | undefined>(CSRF_MODE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (mode === 'none') return true;

    const passed =
      mode !== 'origin' && req.auth
        ? this.hasValidToken(req, req.auth.session.csrfToken)
        : this.isFromOurOrigin(req);
    if (passed) return true;

    this.logger.warn(`CSRF check failed: ${req.method} ${req.path}`);
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.INVALID_CSRF_TOKEN,
      'Invalid or missing CSRF token',
    );
  }

  private hasValidToken(req: Request, expected: string): boolean {
    const header = req.headers[CSRF_HEADER];
    return typeof header === 'string' && safeEqual(header, expected);
  }

  private isFromOurOrigin(req: Request): boolean {
    return (
      req.headers.origin === this.config.get('CORS_ORIGIN') &&
      req.headers[REQUESTED_WITH_HEADER] === REQUESTED_WITH_VALUE
    );
  }
}
