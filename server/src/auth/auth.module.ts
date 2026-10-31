import { Module } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../common/redis/redis.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LockoutService } from './lockout/lockout.service.js';
import {
  LOCKOUT_STORE,
  type LockoutStore,
  MemoryLockoutStore,
  RedisLockoutStore,
} from './lockout/lockout.store.js';

@Module({
  imports: [UsersModule, SessionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LockoutService,
    {
      provide: LOCKOUT_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisClient): LockoutStore =>
        redis ? new RedisLockoutStore(redis) : new MemoryLockoutStore(),
    },
  ],
})
export class AuthModule {}
