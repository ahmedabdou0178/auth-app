import { STATUS_CODES } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { type ApiError, ErrorCode } from '@auth-app/shared';

const API_PREFIX = '/api';

/**
 * Nest registers its not-found handler under the global prefix only, so anything outside
 * `/api` would get express' default HTML 404. Answer those with the standard JSON error too.
 */
export function outsideApiMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === API_PREFIX || req.path.startsWith(`${API_PREFIX}/`)) {
    next();
    return;
  }
  const body: ApiError = {
    statusCode: 404,
    error: STATUS_CODES[404] ?? 'Not Found',
    message: 'Not found',
    code: ErrorCode.NOT_FOUND,
    requestId: typeof req.id === 'string' ? req.id : 'unknown',
  };
  res.status(404).json(body);
}
