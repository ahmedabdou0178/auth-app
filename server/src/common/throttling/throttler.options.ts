import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppConfig } from '../../config/app-config.js';
import type { RedisClient } from '../redis/redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const ONE_MINUTE_MS = 60_000;

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many attempts, try again later';

const AUTH_RATE_LIMIT_KEY = 'throttle:auth';
/** Applies the strict `auth` throttler (AUTH_THROTTLE_LIMIT/min per IP) to a route. */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT_KEY, true);

const reflector = new Reflector();

/**
 * Two named throttlers, both per IP (req.ip, so TRUST_PROXY decides which hop counts) per
 * route per minute. This is defense in depth: in a deployment the edge (load balancer / WAF /
 * CDN) applies its own rate-limit rules before traffic reaches nginx and the API.
 */
export function throttlerOptions(config: AppConfig, redis: RedisClient): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'default', ttl: ONE_MINUTE_MS, limit: config.get('THROTTLE_LIMIT') },
      {
        name: 'auth',
        ttl: ONE_MINUTE_MS,
        limit: config.get('AUTH_THROTTLE_LIMIT'),
        skipIf: (context: ExecutionContext) =>
          reflector.get<boolean | undefined>(AUTH_RATE_LIMIT_KEY, context.getHandler()) !== true,
      },
    ],
    errorMessage: TOO_MANY_REQUESTS_MESSAGE,
    ...(redis ? { storage: new RedisThrottlerStorage(redis) } : {}),
  };
}
