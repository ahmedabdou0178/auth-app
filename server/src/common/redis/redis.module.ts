import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** `null` when `REDIS_URL` is unset (local dev, tests): counters then stay in process memory. */
export type RedisClient = Redis | null;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): RedisClient => {
        const url = config.get('REDIS_URL');
        if (!url) return null;
        const client = new Redis(url, { maxRetriesPerRequest: 2 });
        const logger = new Logger('Redis');
        client.on('error', (error: Error) => {
          logger.warn(`Redis error: ${error.message}`);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis?.quit();
  }
}
