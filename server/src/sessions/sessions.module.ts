import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { CsrfGuard } from './csrf.guard.js';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema.js';
import { SessionCookies } from './session-cookies.js';
import { SessionGuard } from './session.guard.js';
import { Session, SessionSchema } from './session.schema.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [
    SessionsService,
    SessionCookies,
    // Order matters: the CSRF check needs the session SessionGuard attaches.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [SessionsService, SessionCookies],
})
export class SessionsModule {}
