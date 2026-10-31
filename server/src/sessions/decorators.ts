import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

export const IS_PUBLIC_KEY = 'auth:public';
/** The route works without a session (one is still attached when a valid `sid` is sent). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * CSRF mode for unsafe methods:
 * - default: `X-CSRF-Token` when a session is attached, otherwise Origin + `X-Requested-With`
 * - `origin`: always Origin + `X-Requested-With` (refresh: the session may have expired)
 * - `none`: no check (sign-up / sign-in create the session; SameSite + CORS protect them)
 */
export type CsrfMode = 'origin' | 'none';
export const CSRF_MODE_KEY = 'auth:csrf';
export const Csrf = (mode: CsrfMode) => SetMetadata(CSRF_MODE_KEY, mode);

/** The `AuthContext` of a route behind `SessionGuard` (non-public routes always have one). */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext | undefined =>
    context.switchToHttp().getRequest<Request>().auth,
);
