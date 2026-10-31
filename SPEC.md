# Agent prompt — rebuild the User Authentication App

You are an AI coding agent. Build this repository **from scratch** so that it matches this document exactly. Every design decision below has already been made and approved by the author. If something here is ambiguous or a new decision is needed, **stop and ask the author**, then record the answer (choice, alternatives, trade-off, who decided) in `tradeoffs.md`. Follow the code rules in `CLAUDE.md`.

Read the whole document before writing code. Follow the build order in §12 and verify each checkpoint by running the commands and reading their real output.

---

## 1. The Task

A module that lets a user **sign up** and **sign in**, production-ready and following industry best practices.

| #   | Requirement |
| --- | ----------- |
| R1  | Front end in **React** with **TypeScript** (design is free; any libraries allowed). |
| R2  | **Sign-up page**: **Email** (valid format), **Name** (minimum 3 characters), **Password** (minimum 8 characters, at least one letter, one number, one special character). |
| R3  | **Sign-in page**: **Email**, **Password**. |
| R4  | **Application page** showing exactly `Welcome to the application.` and a **logout** button. |
| R5  | Back end in **NestJS** with **MongoDB**. |
| R6  | At least **one protected endpoint**. |
| R7  | The API enforces the **same field rules** as the front end. |
| R8  | `README.md` explaining how to work with the repo. |
| R9  | `AI.md` describing AI usage: which parts were AI-assisted, which prompts worked, what had to be corrected, decisions made differently from the AI. **The author writes it**; you may only draft from verifiable records, marking everything else **[author to confirm]**. |

---

## 2. Toolchain and versions

- **Node 24**, `>= 24.11.1` (`.nvmrc` = `24`, root `engines.node` = `>=24.11.1 <25.0.0`). Reasons: NestJS 12 is ESM-only and Jest can only `require()` ESM on Node ≥ 24.9; the OpenTelemetry ESM hook needs `module.registerHooks()` (fixed in 24.11.1).
- **pnpm 12.16.1** via corepack (`"packageManager": "pnpm@12.16.1"`), workspaces `shared`, `server`, `client`. Only `pnpm-lock.yaml`; never npm/yarn lockfiles. All pnpm settings live in `pnpm-workspace.yaml` (pnpm 12 rejects unknown keys there; there is no `.npmrc`).
- **TypeScript 6** (`strict`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals/Parameters`, `isolatedModules`). Not TS 7: typescript-eslint, ts-jest and @nestjs/swagger don't support it.
- **API:** NestJS 12, Mongoose 9 (`@nestjs/mongoose`), `@nestjs/config`, `@nestjs/throttler` 6, `@nestjs/swagger`, `@nestjs/terminus`, `nestjs-pino` + `pino-http`, `helmet`, `cookie-parser`, `argon2`, `ioredis` **5** (ioredis-mock only supports 5), `express` 5 (same version as `@nestjs/platform-express`), OpenTelemetry SDK. Built with plain `tsc`. **No JWT, no Passport.**
- **Web:** Vite 8, React 19, `react-router-dom` 7, `@tanstack/react-query` 5, `react-hook-form` + `@hookform/resolvers`, `axios`, Tailwind CSS 4 (`@tailwindcss/vite`).
- **Shared:** `zod` 4.
- **Tests:** Jest 30 + ts-jest + supertest + `mongodb-memory-server` + `ioredis-mock` (server); Vitest + React Testing Library + user-event + jsdom (client, shared).
- **Tooling:** ESLint flat config (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, `eslint-plugin-react-hooks` for the client; plugins installed at the root; `no-extraneous-class` with `allowWithDecorator`; `docker/` ignored), Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`), Docker, Docker Compose ≥ 2.24, GitHub Actions, Semgrep, OWASP ZAP.
- Before using any library API, check the **installed** version (`pnpm why`, the installed `.d.ts`). Pick versions that satisfy every peer range.

### Supply chain (`pnpm-workspace.yaml`)

- `saveExact: true`, `engineStrict: true` (and pin exact versions by hand when adding with a range).
- `minimumReleaseAge: 10080` (7 days). Exceptions only in `minimumReleaseAgeExclude`, exact versions, each with a comment (e.g. a security fix younger than 7 days).
- `trustPolicy: no-downgrade`; `trustPolicyExclude` only for exact old versions published before provenance existed (e.g. `semver@6.3.1` for @babel/core), each commented.
- `blockExoticSubdeps: true`.
- `allowBuilds`: install scripts are blocked unless listed; every entry has a comment. Deny (`false`): `@scarf/scarf` (telemetry), `argon2` (its bundled glibc/musl prebuilds load without the script), `@parcel/watcher`, `mongodb-memory-server` (binary downloads lazily), `unrs-resolver`, `protobufjs`.
- `overrides`: pin patched transitive versions when `pnpm audit --prod` reports something the parent hasn't shipped yet, each with the advisory ID; remove once the parent catches up. `pnpm audit --prod` must report no known vulnerabilities.

---

## 3. Repository layout

```
.
├── shared/            # @auth-app/shared — zod schemas, password rules, API types, header names, error codes
├── server/            # @auth-app/server — NestJS API (CommonJS, NodeNext `.js` specifiers)
│   ├── src/{auth,sessions,users,health,common,config}/ + main.ts, instrumentation.ts, configure-app.ts, swagger.ts, app.module.ts
│   ├── test/          # e2e suites, helpers, setup-env.ts
│   └── Dockerfile
├── client/            # @auth-app/client — React app (ESM, Vite)
│   ├── src/{api,auth,app,components,pages,test}/ + main.tsx, zod-config.ts, index.css
│   ├── Dockerfile, nginx.conf, security-headers.conf
├── docker/mongo-init/create-app-user.js
├── scripts/check-prod-config.sh
├── scripts/security/{sast.sh,dast.sh,docker-compose.dast.yml,zap-baseline-rules.tsv,zap-api-rules.tsv}
├── .github/workflows/ci.yml
├── docker-compose.yml, docker-compose.prod.yml
├── .env.example, .nvmrc, .gitignore, .dockerignore, .semgrepignore, .prettierrc.json, .prettierignore
├── eslint.config.mjs, tsconfig.base.json, package.json, pnpm-workspace.yaml
└── README.md, SPEC.md, CLAUDE.md, AI.md
```

`.gitignore` covers `node_modules`, `dist`, `coverage`, `*.tsbuildinfo`, `.env*` (except `.env.example`) and `reports/`.

---

## 4. Shared package

Single source of truth for field rules; the API and the web app both use it.

```ts
email    = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254, 'Email is too long'))
name     = z.string().trim().min(3, 'Name must be at least 3 characters').max(50, 'Name must be at most 50 characters')
password = z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters')
             .regex(/[A-Za-z]/, 'At least one letter').regex(/\d/, 'At least one number')
             .regex(/[^A-Za-z0-9]/, 'At least one special character')
signUpSchema = z.object({ email, name, password })                         // strips unknown keys
signInSchema = z.object({ email, password: z.string().min(1, 'Password is required') })  // no complexity rules
```

- Limits and regexes are exported constants shared by `passwordSchema` and `passwordRules` (`{ id: 'minLength' | 'letter' | 'number' | 'special', label, test }`), so the UI checklist can't drift.
- Export `ErrorCode`: `VALIDATION_ERROR, BAD_REQUEST, UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_SESSION, INVALID_REFRESH_TOKEN, INVALID_CSRF_TOKEN, NOT_FOUND, EMAIL_TAKEN, PAYLOAD_TOO_LARGE, TOO_MANY_REQUESTS, ACCOUNT_LOCKED, SERVICE_UNAVAILABLE, INTERNAL_ERROR`.
- Types: `SignUpInput`, `SignInInput`, `UserDto { id, email, name, createdAt }`, `AuthResponse { user, csrfToken }`, `MeResponse` (same shape), `ValidationErrorDetail { field, message }`, `ApiError { statusCode, error, message, code, requestId, details? }`.
- Constants: `CSRF_HEADER = 'x-csrf-token'`, `REQUESTED_WITH_HEADER = 'x-requested-with'`, `REQUESTED_WITH_VALUE = 'fetch'`.
- Builds to CommonJS (`tsc`, `noEmitOnError`) for the API; the client compiles the TypeScript source through a Vite alias + tsconfig `paths`. Root `dev`, `lint`, `typecheck`, `test` build it first.

---

## 5. API

### 5.1 Configuration

Validate the environment with a zod schema passed to `ConfigModule.forRoot({ validate })`. Treat empty values (`VAR=`) as unset. On failure throw one readable error: `Config validation error: <path>: <message>; …`.

| Variable | Default | Rule |
| -------- | ------- | ---- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `3000` | |
| `MONGODB_URI` | — | starts with `mongodb://` or `mongodb+srv://` |
| `SESSION_TTL` | `15m` | `<n>s\|m\|h\|d` → seconds |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | |
| `CORS_ORIGIN` | — | URL; the single allowed origin |
| `COOKIE_SECURE` | `true` | `true`/`false` |
| `LOG_LEVEL` | `info` | pino level or `silent` |
| `THROTTLE_LIMIT` / `AUTH_THROTTLE_LIMIT` | `100` / `5` | per IP per route per minute |
| `LOCKOUT_MAX_ATTEMPTS` | `5` | per email + client IP |
| `LOCKOUT_ACCOUNT_MAX_ATTEMPTS` | `100` | per email across IPs; must be ≥ `LOCKOUT_MAX_ATTEMPTS` |
| `LOCKOUT_DURATION` | `15m` | lock length and counting window |
| `TRUST_PROXY` | `1` | hop count, `false` (→ 0) or comma list of IPs/CIDRs/`loopback`/`linklocal`/`uniquelocal`; **`true` is refused** |
| `SWAGGER_ENABLED` | unset | unset → on outside production, off in production |
| `REDIS_URL` | unset | `redis://` or `rediss://`; in-memory counters when unset |

Production rules: `CORS_ORIGIN` must be `https` and `COOKIE_SECURE` must be `true` unless the origin is localhost; `REDIS_URL` is required. The API reads the repo-root `.env` (`envFilePath: ['../.env', '.env']`) **only when `NODE_ENV` isn't explicitly `test` or `production`** in the real environment.

### 5.2 Data model (Mongoose)

- **users**: `email` (unique, lowercase, trimmed), `name`, `passwordHash` (`select: false`), timestamps; `toJSON` whitelists `id, email, name, createdAt, updatedAt`. Call `Model.init()` on module init so the unique index exists before requests.
- **sessions**: `sessionId` (raw cookie value, unique), `userId`, `refreshTokenId`, `csrfToken` (raw), `createdAt`, `lastActivityAt`, `expiresAt` (TTL index `expireAfterSeconds: 0`), `initialIp?`, `lastSeenIp?`, `userAgent?` (≤ 512 chars).
- **refresh_tokens**: `userId`, `tokenHash` (SHA-256 hex, unique), `expiresAt` (TTL index), `revokedAt` (default null), `createdAt`.
- Every lookup also checks `expiresAt > now` (and `revokedAt: null`) because the TTL monitor lags up to ~60 s.

### 5.3 Endpoints

All under `/api`. Every error body: `{ statusCode, error, message, code, requestId, details? }`.

| Method | Path | Access | CSRF | Success | Errors |
| ------ | ---- | ------ | ---- | ------- | ------ |
| POST | `/auth/signup` | public | none | `201 { user, csrfToken }` + `sid` + `refresh_token` cookies | 400, 409 `EMAIL_TAKEN`, 429 |
| POST | `/auth/signin` | public | none | `200 { user, csrfToken }` + both cookies | 400, 401 `INVALID_CREDENTIALS`, 429 (`TOO_MANY_REQUESTS` / `ACCOUNT_LOCKED`) |
| POST | `/auth/refresh` | refresh cookie | `Origin` + `X-Requested-With` | `200 { user, csrfToken }` + new `sid` (refresh cookie not re-sent) | 401 `INVALID_REFRESH_TOKEN` (and both cookies cleared), 403 |
| POST | `/auth/logout` | cookies optional | token if a session is attached, else `Origin` + `X-Requested-With` | `204`, both cookies cleared | 403 |
| GET | `/users/me` | **session** (the protected endpoint) | — | `200 { user, csrfToken }` | 401 `INVALID_SESSION` |
| GET | `/health` | public, never throttled | — | `200` (terminus: Mongo ping, Redis ping when configured) | 503 |

### 5.4 Sessions, refresh, CSRF

- **Tokens:** `crypto.randomBytes(32).toString('base64url')` for session IDs, CSRF tokens and refresh tokens. Compare CSRF tokens with `crypto.timingSafeEqual`.
- **Cookies** (`HttpOnly`, `SameSite=Strict`, `Secure = COOKIE_SECURE`): `sid` path `/api`, `maxAge = SESSION_TTL` (fixed, no sliding); `refresh_token` path `/api/auth`, `maxAge = REFRESH_TOKEN_TTL_DAYS`. Clear with the same options.
- **Read cookies only through `readTokenCookie()`**: accept strings of 1–128 chars, ignore anything else. cookie-parser turns `j:`-prefixed values into objects, which would otherwise reach Mongo queries as operators (`sid=j:{"$ne":null}`).
- **Sign-up / sign-in** create a refresh token (hash stored) and its first session.
- **SessionGuard** (global `APP_GUARD`): resolves `sid` → live session → existing user, sets `req.auth = { user, session }` (type it by augmenting `http.IncomingMessage`). Non-`@Public()` routes get `401 INVALID_SESSION` without one; public routes just get `req.auth` when present. Writes `lastActivityAt`/`lastSeenIp` at most once per minute (conditional update on the value read).
- **Refresh:** find the token by hash (not revoked, not expired) → delete the presented session if it belongs to that token → create a new session (new `sid`, new CSRF token) → set the new `sid`. The refresh token is **never rotated**. On failure clear both cookies.
- **Logout:** find refresh token ids from the refresh cookie and/or the session; revoke them and delete every session they created; clear both cookies; 204 even with no cookies.
- **CsrfGuard** (global, registered after SessionGuard) on POST/PUT/PATCH/DELETE: `@Csrf('none')` skips (sign-up, sign-in); `@Csrf('origin')` (refresh) and any request without a session require `Origin === CORS_ORIGIN` **and** `X-Requested-With: fetch`; otherwise require `X-CSRF-Token` equal to the session's token. Rejections: `403 INVALID_CSRF_TOKEN`, logged at `warn`.

### 5.5 Security rules

1. **argon2id** (library defaults, ~64 MiB per hash). Never log passwords or hashes; return users only through a `toUserDto` mapper.
2. **No enumeration:** same `401 "Invalid email or password"` for unknown email and wrong password; for an unknown email run one argon2 verify against a dummy hash created at startup.
3. **Duplicates:** rely on the unique index; Mongo error `11000` → `409 EMAIL_TAKEN`.
4. **Rate limiting:** two named throttlers, per IP per route per minute: `default` (`THROTTLE_LIMIT`) and `auth` (`AUTH_THROTTLE_LIMIT`), the latter only on routes marked `@AuthRateLimit()` (implement with the throttler's `skipIf`). Message `"Too many attempts, try again later"`. Use a guard subclass (`AppThrottlerGuard`) that throws `AppException(429, TOO_MANY_REQUESTS)` with a standard `Retry-After` (named throttlers otherwise send only `Retry-After-<name>`). Register it in `AppModule` so it runs **before** the session lookup. With `REDIS_URL`, a `ThrottlerStorage` on ioredis runs one atomic Lua script per hit (count in a fixed window, block once over the limit; return seconds); hash-tag the keys (`throttle:{name:key}:hits|block`). `@SkipThrottle()` on health.
5. **Lockout (two levels — never per email only, or anyone could lock the owner out):**
   - per **email + client IP** (`req.ip`, so `TRUST_PROXY` matters): `LOCKOUT_MAX_ATTEMPTS` failures within `LOCKOUT_DURATION` lock that IP out of that email;
   - per **email across all IPs**: `LOCKOUT_ACCOUNT_MAX_ATTEMPTS` failures lock every IP (distributed brute force).
   - Keys are SHA-256 of the normalized email (and IP), so unknown emails lock like real ones: `ip:<sha256(email\nip)>`, `account:<sha256(email)>`.
   - Checked **before** the user lookup: while locked, `429 ACCOUNT_LOCKED`, message `"Too many failed sign-in attempts, try again later"`, `Retry-After` in seconds, no argon2 verify even for the right password.
   - A successful sign-in resets that IP's count only (the account-wide count expires on its own).
   - Store: Redis (Lua: INCR + PEXPIRE on first failure; at the limit SET a lock key with PX and DEL the counter) or an in-memory fallback without `REDIS_URL`.
6. **Hardening:** `helmet()`; CORS with the single `CORS_ORIGIN`, `credentials: true`, allowed headers `Content-Type, X-CSRF-Token, X-Requested-With, X-Request-Id`, exposed `X-Request-Id, Retry-After`; `cookie-parser`; JSON body limit 10 kb; `Cache-Control: no-store` on API responses; `app.set('trust proxy', TRUST_PROXY)`; `enableShutdownHooks()`.

### 5.6 HTTP pipeline (`configure-app.ts`, shared by `main.ts` and e2e tests)

Order: pino logger → `trust proxy` → request-ID middleware (reuse `X-Request-Id` only if it matches `^[\w-]{1,128}$`, else a UUID; set the response header) → helmet → cookie-parser → no-store → CORS → **outside-`/api` middleware** (any path not `/api` or `/api/*` gets the JSON `404 NOT_FOUND`; Nest registers its not-found handler under the global prefix only) → `setGlobalPrefix('api')` → global `AllExceptionsFilter` → Swagger when enabled.

- Create the app with `bodyParser: false` and parse JSON in a **Nest middleware** (`JsonBodyMiddleware`, `forRoutes('{*splat}')`) that awaits `express.json({ limit: '10kb' })` and **throws** on error: body-parser errors passed to `next(err)` bypass Nest's exception filters.
- `AllExceptionsFilter`: `AppException` (status, `ErrorCode`, message, optional `details`, optional `headers`) → as is, setting its headers; other `HttpException` → mapped code, message from the response (5xx: status text only); body-parser errors → `400 BAD_REQUEST "Malformed request body"` or `413 PAYLOAD_TOO_LARGE "Request body is too large"`; anything else → `500 INTERNAL_ERROR "Something went wrong"`, stack logged server-side only. Never leak stack traces or Mongo errors. Always include `requestId`.
- `ZodValidationPipe(schema)` → `400 VALIDATION_ERROR "Validation failed"` with `details` (`field` = joined path).

### 5.7 Logging and telemetry

- `nestjs-pino`: pretty in development, JSON otherwise; `genReqId` returns the ID set by the middleware; `/api/health` not auto-logged; level error ≥ 500, warn ≥ 400.
- **Redact** (`[REDACTED]`): `req.headers.cookie`, `req.headers.authorization`, `req.headers["x-csrf-token"]`, `res.headers["set-cookie"]`, and `password`, `passwordHash`, `csrfToken` at the top level and one level down.
- Auth events via `@InjectPinoLogger`: `signup`, `signin`, `signin_failed` (with a 16-char SHA-256 prefix of the email, never the email), `signin_locked`, `lockout_started` (`scope: 'ip' | 'account'`, warn), `refresh`, `logout`. Never log session IDs, CSRF or refresh tokens.
- **OpenTelemetry** (`instrumentation.ts`, the first import in `main.ts`): starts only when an `OTEL_EXPORTER_OTLP_*ENDPOINT` is set and `OTEL_SDK_DISABLED !== 'true'`. `NodeSDK` with OTLP/HTTP trace, log (`new BatchLogRecordProcessor({ exporter })`) and metric exporters (`PeriodicExportingMetricReader` with `exportIntervalMillis` read from `OTEL_METRIC_EXPORT_INTERVAL`, which a hand-built reader ignores otherwise); instrumentations http (ignore `/api/health`, no headers recorded), express, mongoose, ioredis, pino. Register the ESM hook with import-in-the-middle's `register()` from `import-in-the-middle/register-hooks.mjs` (uses `module.registerHooks()`; `module.register()` is deprecated) — add a local `.d.ts` because its types don't resolve under NodeNext. Default `OTEL_SERVICE_NAME=auth-api`. Flush on shutdown via an `OnApplicationShutdown` provider.

### 5.8 Swagger

At `/api/docs` (JSON at `/api/docs-json`), only when enabled. Document every route with DTO classes (decorators only; zod validates) whose constraints mirror the shared schemas, the error DTO, the `X-CSRF-Token` / `X-Requested-With` headers, and two cookie security schemes: `addCookieAuth('sid', {...}, 'session')` and `addCookieAuth('refresh_token', {...}, 'refresh')` — pass the **scheme name** explicitly (it defaults to `cookie`).

---

## 6. Web app

### 6.1 Routes (`app/router.tsx`, exported `routes` used by tests)

Root layout (inside the router, so it can navigate) = `AuthProvider` + `Suspense` with a full-page spinner. `/` redirects by session state; `/signup`, `/signin` are public-only; `/app` is protected; `*` is a 404 page. Every page is lazy-loaded (`app/lazy-pages.ts`). The client build sets `NODE_ENV=production`.

### 6.2 Auth state

- `AuthProvider` restores the session with a React Query query (`['auth','session']`, `staleTime: Infinity`, `retry: false`) calling `GET /users/me` — one request even under StrictMode. 401 → signed out. Status: `loading | authenticated | unauthenticated`.
- The **CSRF token** is the only token in JS: a module variable (`api/csrf-store.ts`), set from every `AuthResponse`/`MeResponse`, never in Web Storage.
- `signIn` / `signUp` set the token and the session data; pages don't navigate — `PublicOnlyRoute` redirects to `state.from` when it's a same-app path (`/x`, not `//host`), else `/app`. `ProtectedRoute` shows the spinner while loading (never protected content) and redirects to `/signin` with `state.from`.
- `logout()` calls the API **first**; only on success it clears the token, the query cache and navigates to `/signin`. If the request fails the user **stays signed in** and the page shows `"Couldn't log out. Check your connection and try again."` (the httpOnly cookies would otherwise silently restore the session).

### 6.3 HTTP client (`api/client.ts`)

- One axios instance: `baseURL = VITE_API_URL ?? '/api'`, `withCredentials: true`, default header `X-Requested-With: fetch`. Request interceptor adds `X-CSRF-Token` on unsafe methods when a token is held.
- **401** from a non-auth endpoint (`/auth/signin|signup|refresh|logout` excluded): one **single-flight** `POST /auth/refresh` shared by concurrent callers, then retry once. A successful refresh replaces the CSRF token; a failed one clears it and calls the session-expired handler (AuthProvider sets the session to null; route guards redirect).
- **403 `INVALID_CSRF_TOKEN`** (any endpoint except `/auth/refresh`, whose 403 is the Origin check): tabs share the `sid` cookie but each holds its own token, so another tab's refresh/sign-in makes this tab's token stale. Re-read the current token with a **single-flight** `GET /users/me`, then retry once.
- API module `api/auth-api.ts` (`signUp`, `signIn`, `logout`, `me`) — tests mock this module. `errors.ts` maps axios errors to `ApiError`. React Query never retries 4xx.
- `zod-config.ts` (imported first in `main.tsx`): `z.config({ jitless: true })` so the strict CSP never sees `new Function`.

### 6.4 Forms and UI

- react-hook-form + `zodResolver(signUpSchema | signInSchema)`, `mode: 'onTouched'`, default values `''`. Server errors: 409 → email field `"Email is already registered"`; 401 → form alert `"Invalid email or password"`; 429 (`TOO_MANY_REQUESTS` or `ACCOUNT_LOCKED`) → `"Too many attempts, try again later"`; 400 with details → field errors; else a generic message. Form alerts use `role="alert"`.
- Fields: `<label>`, `aria-invalid`, `aria-describedby` (error + description). Password field with a show/hide toggle (`aria-label` "Show password"/"Hide password"). Sign-up shows a live **password checklist** from `passwordRules` with a 4-segment meter (visual only; list items carry "(met)/(not met)" for screen readers). Submit buttons disable and show a spinner while pending (`aria-busy`). Links between sign-in and sign-up.
- App page: heading **exactly** `Welcome to the application.`, "Signed in as <name> (<email>)", **Log out** button.
- Design: Tailwind tokens in `@theme` — mist `#eef1f4` background, white card, ink `#18212f`, muted `#5b6676`, line `#d5dbe3`, brand `#2b4c7e` / `#213b63`, danger `#b3261e`, ok `#1f7a4d`; system font stack (the CSP forbids external fonts); one centered, left-aligned card (`max-w-[26rem]`), responsive to 360 px; visible focus outlines; reduced motion respected. No illustrations or animations beyond the spinner.

---

## 7. Tests (all must pass with `pnpm test` on Node 24)

- **Server Jest config:** `testMatch` `src/**/*.spec.ts` and `test/**/*.e2e-spec.ts`, ts-jest with the server tsconfig (`types: ['node','jest']`; the build tsconfig keeps `['node']`), `moduleNameMapper` `^(\.{1,2}/.*)\.js$ → $1`, `setupFiles: test/setup-env.ts`, test script `node --experimental-vm-modules node_modules/jest/bin/jest.js`. `setup-env.ts` sets a baseline env (`NODE_ENV=test`, `LOG_LEVEL=silent`, limits 10000, `LOCKOUT_MAX_ATTEMPTS=3`, `LOCKOUT_ACCOUNT_MAX_ATTEMPTS=6`, `TRUST_PROXY=1`, no `REDIS_URL`) and silences Nest's default logger with a **static** import (a fire-and-forget dynamic import fails with "import after the Jest environment has been torn down").
- **E2E helper** `createTestApp(env, override?)`: starts `MongoMemoryServer`, applies env, then dynamically imports `AppModule` and `configureApp` (ConfigModule validates at import), compiles, `createNestApplication({ bodyParser: false })`, `configureApp`, `init`.
- **Shared:** each password rule; `passwordRules` agree with `passwordSchema`; boundaries (8-char password accepted, name 3/50 accepted, 51 rejected, email > 254 rejected); trim/lowercase; unknown keys stripped; sign-in without complexity rules.
- **Server unit:** env validation (defaults, empty = unset, one readable error, TRUST_PROXY parsing, production rules, account ≥ per-IP limit); `AuthService` (argon2id hash, 409 propagation, identical 401 + exactly one dummy verify, lockout checked before lookup with the client IP, email never logged, lockout warnings with scope); `LockoutService` (another IP not locked, ceiling locks all, reset clears the IP only); lockout stores and Redis throttler storage (real Lua on ioredis-mock, shared between two instances); `SessionsService` on an in-memory Mongo; `CsrfGuard`; `AllExceptionsFilter` (generic 500 without leaks, 5xx status text, AppException headers/details, body-parser errors, headers already sent); logger redaction.
- **Server e2e:** each invalid sign-up field → 400 with details; sign-up 201 with both cookies' attributes and no `passwordHash`; case-insensitive duplicate → 409; sign-in 400 / identical 401s / 200; `/users/me` without, with, expired, deleted-user, and `j:` object cookie; CSRF 403s; refresh (new `sid`, old `sid` 401, refresh token reusable, unknown → 401 + cleared cookies); logout (all sessions + token revoked; after session expiry only with Origin + X-Requested-With; idempotent); malformed JSON / 413 / request IDs / no-store / helmet; non-`/api` paths → JSON 404; health; lockout (per IP, other IP unaffected, ceiling, unknown emails, reset); spoofed `X-Forwarded-For` with `TRUST_PROXY=false`; production settings (`Secure` cookies, CORS, no Swagger, Redis health via an overridden `REDIS_CLIENT` = ioredis-mock).
- **Client (Vitest, jsdom):** page and guard tests mount the real `routes` in a memory router with the real `AuthProvider` and a mocked `api/auth-api`: sign-up messages, each password rule, live checklist, visibility toggle, 409 on email, normalized submit → `/app`; sign-in 401/429/network/no complexity rules/pending state; protected redirect, loading never shows content, return to the requested page, off-site return path ignored, logout success and failure, `/` redirect, 404. HTTP client against a fake axios adapter: CSRF header only on unsafe methods, single refresh + one retry for concurrent 401s, token replaced, failed refresh signs out, auth-endpoint 401s don't refresh, max one retry, and the **two-tab case** (403 → one `/users/me` → retry once; concurrent 403s share it; no re-read for `/auth/refresh` or other 403s).
- After writing a test that passes first time, prove it can fail (break the code briefly, see it fail, restore).

---

## 8. Docker and nginx

- **API image:** multi-stage on `node:24-alpine` with corepack; install `--frozen-lockfile --filter "@auth-app/server..."` (copy all three `package.json`s first), build shared + server, `pnpm --filter @auth-app/server deploy --prod /out` (server `package.json` has `"files": ["dist"]`); runtime copies `package.json`, `node_modules`, `dist`, runs as `node`.
- **Web image:** build with `VITE_API_URL=/api`, serve with **`nginxinc/nginx-unprivileged`** (non-root, port 8080).
- **nginx:** `server_tokens off`; gzip static assets ≥ 1 kB; `index.html` and SPA routes `no-cache`, `/assets/` immutable for a year, `try_files $uri /index.html`; security headers (`security-headers.conf`, included in every static location, `always`): CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, COOP/COEP/CORP, restrictive Permissions-Policy, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. `location /api`: `gzip off` (BREACH), `client_max_body_size 16k`, **`resolver 127.0.0.11 valid=10s ipv6=off`** + `set $api_upstream http://api:3000; proxy_pass $api_upstream;` (a literal host is resolved once at startup and goes stale when the API container is recreated), `X-Request-Id $request_id`, `X-Forwarded-For`, `X-Forwarded-Proto`; the client's Host is not forwarded.
- **docker-compose.yml** (project `auth-app`): a shared `x-defaults` anchor on every service with `restart: always` and **json-file logging, `max-size ${LOG_MAX_SIZE:-10m}`, `max-file ${LOG_MAX_FILE:-5}`**. Every service has `deploy.resources.limits`, env-overridable:
  - **mongo** (`mongo:8`, 1 GB / 1 CPU): a **single-node replica set `rs0`** (transactions; no failover), auth with a random key file generated at each start, `--wiredTigerCacheSizeGB ${MONGO_CACHE_GB:-0.25}`, init script creating `auth_app` with `readWrite` on `auth`, named volume, healthcheck that initiates the set and waits for a primary, published on `127.0.0.1:27017` only.
  - **redis** (`redis:8-alpine`, 64 MB / 0.25 CPU): `--requirepass`, no persistence, `--maxmemory 48mb --maxmemory-policy noeviction`, not published.
  - **api** (512 MB / 1 CPU): `NODE_ENV=production`, `MONGODB_URI` and `REDIS_URL` assembled from the passwords, `CORS_ORIGIN` default `http://localhost:5173`, `COOKIE_SECURE=false`, `TRUST_PROXY=1`, all limits from env, **`UV_THREADPOOL_SIZE=4`** (≤ 4 concurrent argon2 hashes) and **`NODE_OPTIONS=--max-old-space-size=256`**, healthcheck on `/api/health`.
  - **web** (64 MB / 0.5 CPU): published on `127.0.0.1:5173:8080`.
  - Passwords (`MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `REDIS_PASSWORD`) only from the environment, `${VAR:?required}`.
- **docker-compose.prod.yml:** GHCR images `ghcr.io/${GHCR_OWNER}/auth-app-{api,web}:${IMAGE_TAG:-latest}` with `build: !reset null`, `CORS_ORIGIN` required, `NODE_ENV=production`, `COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`, `TRUST_PROXY: loopback, linklocal, uniquelocal`, Mongo `ports: !reset []`, web `ports: !override [${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}:8080]` (plain HTTP for the TLS load balancer only; Docker-published ports bypass host firewalls, so never bind to `0.0.0.0`). `TRUST_PROXY` trusts only private-network hops so the rate limits and lockout see the real client IP.
- **`scripts/check-prod-config.sh`:** renders base + prod overlay (`COMPOSE` env overrides the command) and fails unless the API gets `NODE_ENV=production`, an `https` `CORS_ORIGIN`, `COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`. With `STRICT=true` the variable and the three password secrets are required; otherwise stand-ins are used. Never prints secrets.
- `.env.example` documents every variable with safe placeholders (`replace-me`), including the optional limits/log variables. The host-side dev `MONGODB_URI` is `mongodb://auth_app:<MONGO_APP_PASSWORD>@localhost:27017/auth?directConnection=true&authSource=auth`.

---

## 9. CI/CD (`.github/workflows/ci.yml`)

Push to `main` and pull requests; default `permissions: contents: read`; `concurrency` cancels superseded runs; every action pinned to a full commit SHA with the version in a comment; untrusted context values only via `env:`.

1. **verify:** checkout (`persist-credentials: false`) → `pnpm/action-setup` (reads `packageManager`) → `setup-node` (`.nvmrc`, pnpm cache) → cache `~/.cache/mongodb-binaries` → `pnpm install --frozen-lockfile` → `format:check` → `lint` → `typecheck` → `test` → `build`.
2. **sast:** `scripts/security/sast.sh`, then upload `reports/semgrep.sarif` to code scanning (`security-events: write`).
3. **dast:** `scripts/security/dast.sh`, upload `reports/` as an artifact.
4. **docker** (needs all three, `packages: write`): `docker compose build` (stand-in passwords), `check-prod-config.sh` with `STRICT` on main pushes, then on main pushes log in to GHCR and push `auth-app-{api,web}` as `latest` and the commit SHA (lowercase owner).

Validate the workflow with actionlint and the shell scripts with shellcheck.

---

## 10. Security testing

- **SAST** (`sast.sh`): Semgrep image pinned by tag + digest (a release ≥ 7 days old), rulesets `default, typescript, javascript, nodejs, react, owasp-top-ten, secrets, dockerfile, docker-compose, nginx, github-actions`, `--error --metrics=off`, SARIF to `reports/semgrep.sarif`. Must report **0 findings**. Semgrep scans git-tracked files only.
- **DAST** (`dast.sh`): ZAP image pinned by tag + digest. Fresh Compose project `auth-app-dast` with `--env-file /dev/null`, random per-run passwords, and an overlay (`docker-compose.dast.yml`) that removes host ports, enables Swagger and raises all rate and lockout limits. Create a scanner account through `node` inside the api container; add `Cookie: sid=…`, `X-CSRF-Token`, `X-Requested-With`, `Origin` to every ZAP request via replacer rules. Run a baseline scan of the web app (`http://web:8080`) and an active OpenAPI scan of the **API container directly** (`http://api:3000/api/docs-json`). Any unaccepted alert fails; accepted ones live in `zap-*-rules.tsv` with a reason each. Tear down with `-v`.
- Fix findings rather than suppressing them.

---

## 11. Documentation

- **README.md:** minimal quick start — what it is, Docker run, local run (`nvm use`, `corepack enable`, `pnpm install`, `.env`, `docker compose up -d mongo`, `pnpm dev`), service URLs, scripts, repo map, links to SPEC.md and AI.md.
- **CLAUDE.md:** rules for agents (commands, workflow, code rules, invariants from this document).
- **AI.md:** the author's account (headings: Tools used; What was AI-assisted; Prompts and approaches that worked well; What I had to correct or rework; Decisions I made differently from the AI's suggestions; What I wrote / verified myself). Never invent its content.
- Keep `tradeoffs.md` and `AI_NOTES_FOR_AUTHOR.md` (both git-ignored) updated as you go.

---

## 12. Build order and checkpoints

1. **Scaffold:** workspace, root configs, `.gitignore`, `.env.example`. ✅ `pnpm install && pnpm typecheck`.
2. **Shared package** with tests. ✅ tests pass, CJS build loads in Node.
3. **API foundation:** config, Mongo, Redis module, logging, request IDs, JSON body middleware, error filter, hardening, outside-`/api` 404, Swagger, health. ✅ `curl /api/health` 200 against a local Mongo; malformed JSON → 400; 413; no secrets in logs.
4. **Users + sessions + sign-up/sign-in + `/users/me` + CSRF guard.** ✅ curl flow with cookies.
5. **Refresh, logout, rate limiting, two-level lockout.** ✅ curl: CSRF 403s, refresh, logout, lockout per IP.
6. **Server tests** (§7). ✅ green.
7. **Web foundation** (client, auth state, guards) and **8. pages.** ✅ in a real browser: sign-up → `/app`, reload keeps the session, expired session refreshes, logout, two tabs logging out, 360 px layout, empty `document.cookie` and Web Storage, no console/CSP errors.
9. **Client tests.**
10. **Docker, nginx, Compose, prod overlay.** ✅ `docker compose up --build` healthy; limits and log options visible in `docker inspect`; recreating only `api` with a new IP keeps nginx working; concurrent sign-ups stay under the API memory limit.
11. **OpenTelemetry.** ✅ against a local OTLP receiver: traces (route-named, express middleware, Mongoose), logs, metrics; no secrets in the export.
12. **CI workflow.** 13. **SAST + DAST.** ✅ `pnpm test:security` passes.
14. **Docs.** 15. **Final verification (§13).**

Commit only when the author asks (small conventional commits, each only after the full check chain passes). 
---

## 13. Definition of done

- [ ] Fresh clone on Node 24: `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] `pnpm audit --prod`: no known vulnerabilities. `pnpm test:security`: Semgrep 0 findings, ZAP 0 unaccepted alerts.
- [ ] `docker compose up --build` from a fresh clone (README steps followed literally) works end to end.
- [ ] Every requirement R1–R9 met; the API rejects invalid payloads sent directly with the same messages as the UI.
- [ ] App page shows exactly `Welcome to the application.`; logout ends the session; reload keeps it; two tabs can both log out.
- [ ] A single IP can't lock the owner out; failures across many IPs still lock the account.
- [ ] Cookies `HttpOnly` + `SameSite=Strict` (+ `Secure` in production); nothing in Web Storage; no password, hash, session ID, token or email in any log line or response.
- [ ] Swagger documents every endpoint accurately; no `any`, lint/type disables, stray TODOs (except the `TODO(outbox)` design note in `auth.service.ts`), commented-out code or `console.log`.
- [ ] No secrets committed; `.env`, `tradeoffs.md`, `AI_NOTES_FOR_AUTHOR.md` git-ignored.

---

## 14. Rules for you, the agent

- Flag conflicts to the author.
- Ask the author before any decision not covered here; record it in `tradeoffs.md`.
- Follow the code rules in `CLAUDE.md` (naming, readability, tests for every feature).
- Verify every claim by running it (tests, curl, browser, Docker) and reading the real output; report failures honestly.
- Log phases, alternatives chosen, your own bugs and open doubts in `AI_NOTES_FOR_AUTHOR.md`.
- Out of scope (README "Future work" only): email verification and password reset (write the Transactional Outbox design as a `TODO(outbox)` comment in `auth.service.ts`), OAuth, refresh-token rotation with reuse detection, hashed session IDs, a session/device management UI.
