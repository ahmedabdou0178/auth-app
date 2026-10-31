import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { pttlToSeconds, toIntegers } from '../redis/lua.js';

// Not exported from the package root, so derived from the public interface.
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * One atomic round trip per hit: count the hit in a fixed window, block once the limit is
 * exceeded. KEYS: hits, block. ARGV: ttl ms, limit, block duration ms.
 * Returns { totalHits, hits PTTL ms, isBlocked (0/1), block PTTL ms }.
 */
export const THROTTLE_SCRIPT = `
local hitsKey, blockKey = KEYS[1], KEYS[2]
local ttl, limit, block = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local current = tonumber(redis.call('GET', hitsKey)) or (limit + 1)
  return { current, redis.call('PTTL', hitsKey), 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end
local hitsTtl = redis.call('PTTL', hitsKey)

if hits > limit then
  if block > 0 then
    redis.call('SET', blockKey, '1', 'PX', block)
    return { hits, hitsTtl, 1, block }
  end
  return { hits, hitsTtl, 1, hitsTtl }
end
return { hits, hitsTtl, 0, 0 }
`;

/**
 * Throttler counters shared by every API instance. Without it each instance would enforce
 * its own limit, multiplying the effective limit by the number of instances.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'throttle',
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Hash tag keeps both keys in one cluster slot, as a multi-key script requires.
    const base = `${this.prefix}:{${throttlerName}:${key}}`;
    const reply = await this.redis.eval(
      THROTTLE_SCRIPT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      blockDuration,
    );
    const [totalHits = 0, hitsTtl = 0, blocked = 0, blockTtl = 0] = toIntegers(reply, 4);
    return {
      totalHits,
      timeToExpire: pttlToSeconds(hitsTtl),
      isBlocked: blocked === 1,
      timeToBlockExpire: pttlToSeconds(blockTtl),
    };
  }
}
