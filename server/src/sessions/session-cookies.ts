import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../config/app-config.js';

export const SESSION_COOKIE = 'sid';
export const REFRESH_COOKIE = 'refresh_token';

const SESSION_COOKIE_PATH = '/api';
/** The refresh token is only ever sent to the auth endpoints. */
const REFRESH_COOKIE_PATH = '/api/auth';
const MAX_TOKEN_LENGTH = 128;

/**
 * Reads a cookie as a plain string. cookie-parser turns `j:`-prefixed values into objects,
 * which must never reach a Mongo query (operator injection), so anything else is ignored.
 */
export function readTokenCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH
    ? value
    : undefined;
}

@Injectable()
export class SessionCookies {
  constructor(private readonly config: AppConfig) {}

  setSession(res: Response, sessionId: string): void {
    res.cookie(SESSION_COOKIE, sessionId, {
      ...this.options(SESSION_COOKIE_PATH),
      maxAge: this.config.get('SESSION_TTL') * 1000,
    });
  }

  setRefresh(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.options(REFRESH_COOKIE_PATH),
      maxAge: this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.options(SESSION_COOKIE_PATH));
    res.clearCookie(REFRESH_COOKIE, this.options(REFRESH_COOKIE_PATH));
  }

  private options(path: string): CookieOptions {
    return { httpOnly: true, secure: this.config.get('COOKIE_SECURE'), sameSite: 'strict', path };
  }
}
