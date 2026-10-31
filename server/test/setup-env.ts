// Baseline environment for every test file. Each e2e file sets MONGODB_URI (and any override)
// before importing the app, because ConfigModule validates the env when it is imported.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  MONGODB_URI: 'mongodb://127.0.0.1:1/unset',
  CORS_ORIGIN: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
  THROTTLE_LIMIT: '10000',
  AUTH_THROTTLE_LIMIT: '10000',
  LOCKOUT_MAX_ATTEMPTS: '3',
  LOCKOUT_DURATION: '15m',
  TRUST_PROXY: '1',
});
delete process.env.REDIS_URL;
delete process.env.SWAGGER_ENABLED;

// Unit tests construct guards/services directly; keep Nest's default logger quiet there.
// (e2e apps replace it with the silent pino logger anyway.)
void import('@nestjs/common').then(({ Logger }) => {
  Logger.overrideLogger(false);
});
