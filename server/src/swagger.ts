import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SESSION_COOKIE_AUTH = 'sid';

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
      .addCookieAuth(SESSION_COOKIE_AUTH, { type: 'apiKey', in: 'cookie', name: 'sid' })
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
