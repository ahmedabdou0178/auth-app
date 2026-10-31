import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  MongooseHealthIndicator,
  type HealthCheckResult,
  type HealthIndicatorFunction,
} from '@nestjs/terminus';
import { REDIS_CLIENT, type RedisClient } from '../common/redis/redis.module.js';
import { Public } from '../sessions/decorators.js';

const CHECK_TIMEOUT_MS = 1500;

@ApiTags('health')
// Probed by orchestrators every few seconds; must never be rate limited.
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness/readiness: MongoDB ping, plus Redis ping when configured' })
  check(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [
      () => this.mongoose.pingCheck('mongodb').withTimeout(CHECK_TIMEOUT_MS),
    ];
    const { redis } = this;
    if (redis) {
      checks.push(() =>
        this.indicator
          .check('redis')
          .attempt(async () => {
            await redis.ping();
          })
          .withTimeout(CHECK_TIMEOUT_MS),
      );
    }
    return this.health.check(checks);
  }
}
