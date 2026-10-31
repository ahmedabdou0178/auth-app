import { Injectable, type NestMiddleware } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';

export const JSON_BODY_LIMIT = '10kb';

/**
 * JSON body parser run as Nest middleware. A parser error is thrown (not passed to `next`),
 * so malformed and oversized bodies reach the global exception filter like any other error.
 */
@Injectable()
export class JsonBodyMiddleware implements NestMiddleware {
  private readonly parse = json({ limit: JSON_BODY_LIMIT });

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.parse(req, res, (error?: unknown) => {
        if (error) {
          reject(error instanceof Error ? error : new Error('Invalid request body'));
        } else {
          resolve();
        }
      });
    });
    next();
  }
}
