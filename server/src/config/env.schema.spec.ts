import { isSwaggerEnabled, parseDurationSeconds, validateEnv } from './env.schema';

const BASE = {
  MONGODB_URI: 'mongodb://localhost:27017/auth',
  CORS_ORIGIN: 'http://localhost:5173',
};

const PROD = {
  ...BASE,
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://app.example.com',
  COOKIE_SECURE: 'true',
  REDIS_URL: 'redis://redis:6379',
};

describe('validateEnv', () => {
  it('applies defaults and parses types', () => {
    const env = validateEnv(BASE);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      SESSION_TTL: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      COOKIE_SECURE: true,
      THROTTLE_LIMIT: 100,
      AUTH_THROTTLE_LIMIT: 5,
      LOCKOUT_MAX_ATTEMPTS: 5,
      LOCKOUT_DURATION: 900,
      TRUST_PROXY: 1,
    });
    expect(env.REDIS_URL).toBeUndefined();
  });

  it('treats empty values as unset', () => {
    expect(validateEnv({ ...BASE, REDIS_URL: '', PORT: '' })).toMatchObject({ PORT: 3000 });
  });

  it('reports every problem in one readable error', () => {
    expect(() => validateEnv({ MONGODB_URI: 'postgres://x', CORS_ORIGIN: 'nope' })).toThrow(
      /^Config validation error: MONGODB_URI: Must start with mongodb:\/\/ or mongodb\+srv:\/\/; CORS_ORIGIN: /,
    );
  });

  it.each([
    ['false', 0],
    ['2', 2],
    ['loopback, 10.0.0.0/8', ['loopback', '10.0.0.0/8']],
  ])('parses TRUST_PROXY=%s', (value, expected) => {
    expect(validateEnv({ ...BASE, TRUST_PROXY: value }).TRUST_PROXY).toEqual(expected);
  });

  it('refuses TRUST_PROXY=true', () => {
    expect(() => validateEnv({ ...BASE, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('accepts a valid production config', () => {
    expect(validateEnv(PROD).NODE_ENV).toBe('production');
  });

  it.each([
    ['http CORS_ORIGIN', { CORS_ORIGIN: 'http://app.example.com' }, /CORS_ORIGIN: Must use https/],
    ['COOKIE_SECURE=false', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE: Must be true/],
    ['no REDIS_URL', { REDIS_URL: '' }, /REDIS_URL: Required in production/],
  ])('refuses %s in production', (_label, patch, message) => {
    expect(() => validateEnv({ ...PROD, ...patch })).toThrow(message);
  });

  it('allows plain HTTP for a localhost origin in production (local compose)', () => {
    const env = validateEnv({
      ...PROD,
      CORS_ORIGIN: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
    });
    expect(env.COOKIE_SECURE).toBe(false);
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('%s → %i', (value, seconds) => {
    expect(parseDurationSeconds(value)).toBe(seconds);
  });
});

describe('isSwaggerEnabled', () => {
  it.each([
    [undefined, 'development', true],
    [undefined, 'production', false],
    [true, 'production', true],
    [false, 'development', false],
  ] as const)('SWAGGER_ENABLED=%s NODE_ENV=%s → %s', (enabled, nodeEnv, expected) => {
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: enabled, NODE_ENV: nodeEnv })).toBe(expected);
  });
});
