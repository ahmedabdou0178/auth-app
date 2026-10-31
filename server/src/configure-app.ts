import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { CSRF_HEADER, REQUESTED_WITH_HEADER } from '@auth-app/shared';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { AppConfig } from './config/app-config.js';
import { isSwaggerEnabled } from './config/env.schema.js';
import { setupSwagger } from './swagger.js';

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** HTTP pipeline shared by main.ts and the e2e tests, so tests exercise the real setup. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(noStore);
  app.enableCors({
    origin: config.get('CORS_ORIGIN'),
    credentials: true,
    allowedHeaders: ['Content-Type', CSRF_HEADER, REQUESTED_WITH_HEADER, 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (
    isSwaggerEnabled({
      SWAGGER_ENABLED: config.get('SWAGGER_ENABLED'),
      NODE_ENV: config.get('NODE_ENV'),
    })
  ) {
    setupSwagger(app);
  }
}
