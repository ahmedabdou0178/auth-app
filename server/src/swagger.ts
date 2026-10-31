import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI security scheme names (referenced by @ApiCookieAuth). */
export const SESSION_COOKIE_AUTH = 'session';
export const REFRESH_COOKIE_AUTH = 'refresh';

/** Mounts Swagger UI at /api/docs and the OpenAPI JSON at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Auth API')
      .setDescription(
        'Sign-up, sign-in, session refresh and logout. Authentication uses the httpOnly `sid` ' +
          'session cookie; unsafe requests with a session also need the `X-CSRF-Token` header.',
      )
      .setVersion('1.0')
      .addCookieAuth(
        'sid',
        { type: 'apiKey', in: 'cookie', name: 'sid', description: 'Session (15 min, path /api)' },
        SESSION_COOKIE_AUTH,
      )
      .addCookieAuth(
        'refresh_token',
        {
          type: 'apiKey',
          in: 'cookie',
          name: 'refresh_token',
          description: 'Refresh token (7 days, path /api/auth, not rotated)',
        },
        REFRESH_COOKIE_AUTH,
      )
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
