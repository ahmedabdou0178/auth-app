import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '@auth-app/shared';
import { AppException } from '../common/exceptions/app.exception.js';
import { UsersService } from '../users/users.service.js';
import type { AuthContext } from './auth-context.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { readTokenCookie, SESSION_COOKIE } from './session-cookies.js';
import { SessionsService } from './sessions.service.js';

/**
 * Global guard: resolves the `sid` cookie to a live session and an existing user.
 * Non-public routes get 401 without one; public routes just get `req.auth` when present.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();

    const auth = await this.resolve(req);
    if (auth) {
      req.auth = auth;
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_SESSION,
      'Not signed in or session expired',
    );
  }

  private async resolve(req: Request): Promise<AuthContext | null> {
    const sessionId = readTokenCookie(req, SESSION_COOKIE);
    if (!sessionId) return null;
    const session = await this.sessions.findActive(sessionId);
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    if (!user) return null;
    await this.sessions.recordActivity(session, req.ip);
    return { user, session };
  }
}
