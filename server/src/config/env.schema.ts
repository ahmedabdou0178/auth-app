import { z } from 'zod';

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** `15m` → 900. Units: s, m, h, d. */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid duration: ${value}`);
  }
  return Number(match[1]) * DURATION_UNITS[match[2] as keyof typeof DURATION_UNITS];
}

const duration = (fallback: string) =>
  z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'Must be a duration such as 15m (units: s, m, h, d)')
    .default(fallback)
    .transform(parseDurationSeconds);

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Express `trust proxy`: a hop count, `false` (→ 0), or a comma list of IPs/CIDRs/named ranges.
 * `true` is refused: it would trust any client-supplied X-Forwarded-For.
 */
const trustProxy = z
  .string()
  .default('1')
  .transform((value, ctx): number | string[] => {
    const trimmed = value.trim();
    if (trimmed === 'true') {
      ctx.addIssue({
        code: 'custom',
        message: 'true is not allowed: name the trusted hops (count, IPs/CIDRs) instead',
      });
      return z.NEVER;
    }
    if (trimmed === 'false') return 0;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const entries = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Must be a hop count, false, or a list of IPs/CIDRs',
      });
      return z.NEVER;
    }
    return entries;
  });

function isLocalhost(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'Must start with mongodb:// or mongodb+srv://'),
    SESSION_TTL: duration('15m'),
    REFRESH_TOKEN_TTL_DAYS: positiveInt(7),
    CORS_ORIGIN: z.url(),
    COOKIE_SECURE: booleanString.default(true),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    THROTTLE_LIMIT: positiveInt(100),
    AUTH_THROTTLE_LIMIT: positiveInt(5),
    SWAGGER_ENABLED: booleanString.optional(),
    LOCKOUT_MAX_ATTEMPTS: positiveInt(5),
    LOCKOUT_DURATION: duration('15m'),
    TRUST_PROXY: trustProxy,
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//, 'Must start with redis:// or rediss://')
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const localOrigin = isLocalhost(env.CORS_ORIGIN);
    if (!localOrigin && !env.CORS_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'Must use https in production',
      });
    }
    if (!localOrigin && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Must be true in production',
      });
    }
    if (!env.REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'Required in production (shared rate-limit and lockout counters)',
      });
    }
  });

export type Env = z.output<typeof envSchema>;

/** `ConfigModule` hook: returns typed values or throws one readable error listing every problem. */
export function validateEnv(raw: Record<string, unknown>): Env {
  // `VAR=` (common in compose files) means "unset", so defaults and optionals apply.
  const withoutEmpty = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(withoutEmpty);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Config validation error: ${problems}`);
  }
  return result.data;
}

/** Swagger is on when explicitly enabled, or when unset outside production. */
export function isSwaggerEnabled(env: Pick<Env, 'SWAGGER_ENABLED' | 'NODE_ENV'>): boolean {
  return env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production';
}
