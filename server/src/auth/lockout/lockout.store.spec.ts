import RedisMock from 'ioredis-mock';
import { type LockoutStore, MemoryLockoutStore, RedisLockoutStore } from './lockout.store';

const MAX = 3;
const DURATION_MS = 60_000;

// The Redis store runs its real Lua script on ioredis-mock (Lua via fengari).
const stores: [string, () => LockoutStore][] = [
  ['memory', () => new MemoryLockoutStore()],
  ['redis', () => new RedisLockoutStore(new RedisMock(), `t${String(Math.random())}`)],
];

describe.each(stores)('%s lockout store', (_name, create) => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('locks on the last allowed failure for the full duration', async () => {
    const store = create();
    expect(await store.recordFailure('k', MAX, DURATION_MS)).toBe(false);
    expect(await store.recordFailure('k', MAX, DURATION_MS)).toBe(false);
    expect(await store.lockedForMs('k')).toBe(0);
    expect(await store.recordFailure('k', MAX, DURATION_MS)).toBe(true);
    const remaining = await store.lockedForMs('k');
    expect(remaining).toBeGreaterThan(DURATION_MS - 1000);
    expect(remaining).toBeLessThanOrEqual(DURATION_MS);
  });

  it('reset clears the failure count', async () => {
    const store = create();
    await store.recordFailure('k', MAX, DURATION_MS);
    await store.recordFailure('k', MAX, DURATION_MS);
    await store.reset('k');
    expect(await store.recordFailure('k', MAX, DURATION_MS)).toBe(false);
    expect(await store.lockedForMs('k')).toBe(0);
  });

  it('keeps keys independent', async () => {
    const store = create();
    for (let i = 0; i < MAX; i += 1) await store.recordFailure('a', MAX, DURATION_MS);
    expect(await store.lockedForMs('a')).toBeGreaterThan(0);
    expect(await store.lockedForMs('b')).toBe(0);
  });
});

describe('MemoryLockoutStore expiry', () => {
  it('unlocks after the duration', async () => {
    jest.useFakeTimers({ now: 0 });
    const store = new MemoryLockoutStore();
    for (let i = 0; i < MAX; i += 1) await store.recordFailure('k', MAX, DURATION_MS);
    jest.setSystemTime(DURATION_MS + 1);
    expect(await store.lockedForMs('k')).toBe(0);
    jest.useRealTimers();
  });

  it('starts a new window after the old one expires', async () => {
    jest.useFakeTimers({ now: 0 });
    const store = new MemoryLockoutStore();
    await store.recordFailure('k', MAX, DURATION_MS);
    await store.recordFailure('k', MAX, DURATION_MS);
    jest.setSystemTime(DURATION_MS + 1);
    expect(await store.recordFailure('k', MAX, DURATION_MS)).toBe(false);
    jest.useRealTimers();
  });
});

describe('RedisLockoutStore', () => {
  it('shares counters between instances (several API replicas)', async () => {
    const prefix = `shared${String(Math.random())}`;
    const a = new RedisLockoutStore(new RedisMock(), prefix);
    const b = new RedisLockoutStore(new RedisMock(), prefix);
    await a.recordFailure('k', MAX, DURATION_MS);
    await b.recordFailure('k', MAX, DURATION_MS);
    expect(await a.recordFailure('k', MAX, DURATION_MS)).toBe(true);
    expect(await b.lockedForMs('k')).toBeGreaterThan(0);
  });
});
