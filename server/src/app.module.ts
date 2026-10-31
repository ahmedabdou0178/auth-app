import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { JsonBodyMiddleware } from './common/middleware/json-body.middleware.js';
import { REDIS_CLIENT, type RedisClient, RedisModule } from './common/redis/redis.module.js';
import { AppThrottlerGuard } from './common/throttling/app-throttler.guard.js';
import { throttlerOptions } from './common/throttling/throttler.options.js';
import { AppConfig } from './config/app-config.js';
import { AppConfigModule } from './config/config.module.js';
import { loggerOptions } from './common/logging/logger.options.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        loggerOptions({ NODE_ENV: config.get('NODE_ENV'), LOG_LEVEL: config.get('LOG_LEVEL') }),
    }),
    MongooseModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        uri: config.get('MONGODB_URI'),
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: RedisClient) => throttlerOptions(config, redis),
    }),
    HealthModule,
    AuthModule,
  ],
  // Registered before SessionsModule's guards: rate limits apply before any session lookup.
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JsonBodyMiddleware).forRoutes('{*splat}');
  }
}
