import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { JsonBodyMiddleware } from './common/middleware/json-body.middleware.js';
import { RedisModule } from './common/redis/redis.module.js';
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
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JsonBodyMiddleware).forRoutes('{*splat}');
  }
}
