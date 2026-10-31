import RedisMock from 'ioredis-mock';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const TTL = 60_000;
const LIMIT = 3;

function storage(prefix = `t${String(Math.random())}`): RedisThrottlerStorage {
  return new RedisThrottlerStorage(new RedisMock(), prefix);
}

describe('RedisThrottlerStorage', () => {
  it('counts hits within the window and reports seconds to expiry', async () => {
    const store = storage();
    const first = await store.increment('ip', TTL, LIMIT, TTL, 'default');
    expect(first).toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const second = await store.increment('ip', TTL, LIMIT, TTL, 'default');
    expect(second.totalHits).toBe(2);
  });

  it('blocks once the limit is exceeded and stays blocked', async () => {
    const store = storage();
    for (let i = 0; i < LIMIT; i += 1) {
      expect((await store.increment('ip', TTL, LIMIT, TTL, 'auth')).isBlocked).toBe(false);
    }
    const blocked = await store.increment('ip', TTL, LIMIT, TTL, 'auth');
    expect(blocked).toMatchObject({ isBlocked: true, timeToBlockExpire: 60 });
    expect((await store.increment('ip', TTL, LIMIT, TTL, 'auth')).isBlocked).toBe(true);
  });

  it('keeps throttlers and keys separate', async () => {
    const store = storage();
    for (let i = 0; i <= LIMIT; i += 1) await store.increment('ip', TTL, LIMIT, TTL, 'auth');
    expect((await store.increment('ip', TTL, LIMIT, TTL, 'default')).isBlocked).toBe(false);
    expect((await store.increment('other', TTL, LIMIT, TTL, 'auth')).isBlocked).toBe(false);
  });

  it('shares one limit across instances (several API replicas)', async () => {
    const prefix = `shared${String(Math.random())}`;
    const a = storage(prefix);
    const b = storage(prefix);
    await a.increment('ip', TTL, LIMIT, TTL, 'auth');
    await b.increment('ip', TTL, LIMIT, TTL, 'auth');
    await a.increment('ip', TTL, LIMIT, TTL, 'auth');
    expect((await b.increment('ip', TTL, LIMIT, TTL, 'auth')).isBlocked).toBe(true);
  });
});
