# Trade-offs (internal)

One entry per decision: what was chosen, what else was considered, what it costs.
**Decided by:** `user` = the author chose it · `spec` = from `SPEC.md` generated from task pdf· `agent` = AI's call (author to review).

---

## A. Runtime & tooling

### A1 — pnpm workspaces instead of npm workspaces
- **Decided by:** user
- **Alternatives:** npm workspaces, yarn.
- **Gains:** strict `node_modules` (no phantom dependencies), faster installs, content-addressed store, `pnpm deploy --prod` gives a clean production folder for the API image.
- **Costs:** CI and Docker need corepack to pin the pnpm version.

### A1b — pnpm 12.16.1 pinned via `packageManager`
- **Decided by:** user ("use the LTS"; pnpm publishes no LTS tag, so the user chose the current stable major)
- **Alternatives:** 10.34.9 (local major), 11.28.9 (previous major).
- **Gains:** actively maintained major; fails on unknown/misspelled `pnpm-workspace.yaml` settings (a typo can't silently drop `minimumReleaseAge`); `trustPolicy`, `allowBuilds`.
- **Costs:** contributors with pnpm 10 get it via corepack; settings live in `pnpm-workspace.yaml`, not `.npmrc` (so no `.npmrc` file).

### A3b — TypeScript 6.0.3 (not 7) and ioredis 5 (not 6)
- **Decided by:** spec (agent verified)
- **Why:** TypeScript 7 is out, but typescript-eslint (`<6.1`), ts-jest (`<7`) and @nestjs/swagger (`^5.5 || ^6`) don't support it. ioredis-mock (used for Lua script tests) supports only ioredis 5.
- **Costs:** one major behind on both; upgrade when the ecosystem catches up.

### A2 — Node 24 LTS
- **Decided by:** user
- **Alternatives:** stay on Node 22 and test the server with Vitest.
- **Gains:** NestJS 12 is ESM-only; Jest can `require()` ESM only on Node ≥ 24.9.
- **Costs:** contributors need Node 24 (`.nvmrc`).

### A4 — Supply-chain settings translated to pnpm
- **Decided by:** user
- **Choice:** in `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (7 days), an explicit `allowBuilds` map (pnpm 12's replacement for `onlyBuiltDependencies`), `trustPolicy: no-downgrade` (refuse a version published with weaker provenance than earlier ones), `saveExact`, `engineStrict`.
- **Gains:** same protection as npm's `min-release-age` + `allowScripts`; pnpm 10 already blocks install scripts by default.
- **Costs:** a brand-new security patch can't be installed for 7 days without an override.

---

## B. Auth model

### B1 — Server-side session cookie + non-rotating refresh token
- **Decided by:** user
- **Alternatives:** JWT access token in memory + rotating refresh cookie; single sliding session cookie; JWT in a cookie.
- **Gains:** instant server-side revocation; no token is ever readable by JavaScript; no Web Locks / cross-tab coordination (the refresh token never changes, so concurrent refreshes are harmless).
- **Costs:** one DB lookup per authenticated request; cookies authenticate every API call, so a CSRF defense is mandatory (B4/B5); without rotation there is no reuse detection, so a stolen refresh token stays valid until it expires or the user logs out.

### B3 — MongoDB stores both sessions and refresh tokens
- **Decided by:** user
- **Alternatives:** Redis for sessions; Redis for both.
- **Gains:** one durable store; revocations survive restarts; e2e tests run on `mongodb-memory-server` with no extra infra.
- **Costs:** slower than Redis per request; the TTL monitor runs every ~60 s, so expiry is also checked in code.

### B4 — CSRF: SameSite=Strict + synchronizer token
- **Decided by:** user (style: user, from agent's recommendation)
- **Alternatives:** signed double-submit cookie; plain double-submit cookie; SameSite + Origin check only.
- **Gains:** token is bound to the session, needs no extra secret, and can't be planted by a sibling subdomain (cookie tossing).
- **Costs:** the client must hold the token in memory and get it again after a reload (returned by `GET /users/me`); one extra field on each session.

### B5 — `/auth/refresh` and logout-without-session use Origin + custom header
- **Decided by:** user
- **Alternatives:** bind a CSRF token to the refresh token; SameSite only.
- **Gains:** works when the session (and its CSRF token) has already expired; the custom header `X-Requested-With: fetch` forces a CORS preflight, which a cross-site form can't pass.
- **Costs:** relies on browsers sending `Origin` and enforcing CORS preflights (all current browsers do).

### B6 — Refresh creates a new session and a new sid
- **Decided by:** user
- **Alternatives:** extend the existing session.
- **Gains:** a stolen sid dies within 15 min no matter how often the real user refreshes; blocks session fixation.
- **Costs:** one delete + insert per refresh.

### B7 — sessionId and csrfToken stored raw
- **Decided by:** user
- **Alternatives:** store SHA-256 hashes (as refresh tokens are).
- **Gains:** direct indexed lookup, simpler code.
- **Costs:** **a database read leak lets an attacker hijack every live session (≤ 15 min)**. Mitigations: short session TTL, refresh tokens still stored hashed, DB not exposed beyond localhost/compose network, least-privilege DB user.

### B8 — Fixed 15-minute sid, activity tracked at most once per minute
- **Decided by:** user
- **Alternatives:** sliding idle expiry; write `lastActivityAt` on every request.
- **Gains:** bounded DB writes; predictable session lifetime.
- **Costs:** `lastActivityAt` / `lastSeenIp` are accurate to about one minute.

### B2 — Session shape extended with `refreshTokenId` and `csrfToken`
- **Decided by:** user
- **Gains:** logout can delete every session issued from one refresh token; CSRF token lives with its session.
- **Costs:** two more fields than the author's original interface.

---

## C. Scope

### C7/C8/E3/E4 — Keep every SPEC extra (Redis rate limit + lockout, OpenTelemetry, SAST/DAST, prod overlay + GHCR)
- **Decided by:** user
- **Alternatives:** trim to the PDF's core + basic CI.
- **Gains:** stronger production-readiness story, bonus points (logging, testing, CI/CD).
- **Costs:** longer delivery; the PDF scores speed ("a few hours").

---

## E. Delivery

### E1b — `restart: always` on every Compose service
- **Decided by:** user
- **Alternatives:** `unless-stopped` (a container stopped by hand stays stopped after a daemon restart), `on-failure` (restarts only after a non-zero exit), no policy.
- **Gains:** services recover from crashes and come back after a Docker daemon or host reboot without manual action.
- **Costs:** a container stopped with `docker stop` starts again when the daemon restarts; a service that crashes at boot (e.g. bad config) restarts in a loop, so watch `docker compose ps` / logs. `docker compose down` still removes everything.

### E5 — Agent stages, author commits
- **Decided by:** user
- **Gains:** the author owns and reviews every commit in the evaluated history.
- **Costs:** a pause at every checkpoint.

### E6 — SPEC rewritten before coding, README after verification
- **Decided by:** user
- **Gains:** the agent's source of truth matches the decisions; README commands are tested before they are documented.

### E7 — AI.md reset to template, old file kept as AI.old.md (git-ignored)
- **Decided by:** user
- **Gains:** no claims about a previous implementation leak into the new account.

### Brief PDF git-ignored
- **Decided by:** agent
- **Why:** the PDF is marked "Internal" and the repo will be public.

---

## Agent calls during implementation (author to review)

### JSON body parsing as Nest middleware
- **Decided by:** agent
- **Why:** NestJS 12 doesn't route body-parser `next(err)` errors through exception filters; wrapping `express.json` in a Nest middleware that throws keeps 400/413 in the standard error shape with a request ID.
- **Costs:** one small custom middleware instead of Nest's built-in parser.

### Empty env values mean "unset"
- **Decided by:** agent
- **Why:** Compose files often pass `VAR=`; treating it as unset lets defaults/optionals apply instead of failing format checks.
- **Costs:** an intentionally empty value can't be expressed (none of our variables need one).

### Custom throttler guard for `Retry-After`
- **Decided by:** agent
- **Why:** @nestjs/throttler only sends `Retry-After-auth` for the named `auth` throttler; clients and proxies understand the standard `Retry-After`. The subclass also returns our `TOO_MANY_REQUESTS` error shape.
- **Costs:** one small subclass that overrides a protected method (re-check on throttler upgrades).

### Health endpoint is public and never rate limited
- **Decided by:** agent
- **Why:** orchestrator probes hit it every few seconds without cookies.
- **Costs:** an unauthenticated endpoint that pings the DB; it returns only up/down status.

### `.env` read only in development
- **Decided by:** agent
- **Why:** with `NODE_ENV=test` or `production` set explicitly, the API ignores `.env`; tests and containers get their whole environment explicitly, so a developer's `.env` can never leak in.
- **Costs:** running a production build locally needs the variables exported (e.g. via compose), not a `.env` file.

### `trustPolicyExclude` for semver@6.3.1
- **Decided by:** agent
- **Why:** pnpm 12's `trustPolicy: no-downgrade` flags old release lines published before npm provenance existed; @babel/core (via Jest) needs semver 6. Excluded by exact version only, with the reason in `pnpm-workspace.yaml`.
- **Costs:** that one version isn't provenance-checked; any other semver version still is.

### Failed logout keeps the user signed in
- **Decided by:** agent
- **Alternatives:** clear local state anyway and go to /signin.
- **Why:** the session lives in httpOnly cookies the page can't delete; a "signed out" UI with live cookies would restore the session on reload — a false sense of safety on a shared computer.
- **Costs:** offline users can't "log out" until the request succeeds; they see "Couldn't log out. Check your connection and try again."

### Return to the requested page after sign-in
- **Decided by:** agent
- **Why:** expected UX when a protected link sends you to /signin. Only same-app paths are honoured (`/x`, not `//host` or absolute URLs) to avoid an open redirect.

### Non-root nginx image for the web app
- **Decided by:** agent
- **Alternatives:** `nginx:alpine`.
- **Why:** least privilege; Semgrep's Dockerfile rules flag a final stage without a non-root user.
- **Costs:** listens on 8080 instead of 80 (Compose maps it).

### Prod overlay uses `!reset` / `!override`
- **Decided by:** agent
- **Why:** removes the host-published Mongo port and the localhost-only web binding in production without a separate dev override file.
- **Costs:** needs Docker Compose ≥ 2.24 (CI runners and current Docker Desktop have it).

### Security overrides for `pnpm audit --prod` findings (2026-10-31)
- **Decided by:** user asked to fix the audit findings
- **Findings:** multer 2.4.0 (GHSA-q7qp-rjg7-q26m, high, via @nestjs/platform-express 12.2.0) and follow-redirects 1.16.1 (GHSA-mrwp-f3q8-3g9p, high, via axios).
- **Choice:** `overrides` pinning multer 2.5.0 and follow-redirects 1.16.2; `minimumReleaseAgeExclude` for follow-redirects@1.16.2 only (published 6 days earlier).
- **Alternatives:** upgrade @nestjs/* to 12.3.x (4 days old, blocked by minimumReleaseAge, a bigger change); leave follow-redirects (it's only used by axios' Node adapter, never in the browser bundle).
- **Costs:** overrides must be removed once the parents ship the fixes; one version skips the 7-day quarantine because it is the security fix.
- **Not addressed (dev-only, not in `--prod`):** deepmerge (low, no patch), minimatch (moderate, via eslint), glob (moderate, via jest's coverage tooling).

### Recover from a stale per-tab CSRF token (403 → re-read → retry once)
- **Decided by:** agent (fix for an author-reported bug)
- **Alternatives:** sync tokens between tabs with a BroadcastChannel (avoids the first 403 but adds cross-tab plumbing and still needs a fallback for tabs opened before the change); store the token in a readable cookie (double-submit, a different CSRF design than chosen in B4).
- **Gains:** small, local change; works whatever replaced the session (refresh, sign-in, another device-less tab).
- **Costs:** one extra round trip (403 + GET /users/me) the first time a tab uses a stale token.

### Two-level lockout: per email + IP, plus an account-wide ceiling
- **Decided by:** user (option chosen from the agent's proposals), fixing "anyone can lock any account".
- **Choice:** LOCKOUT_MAX_ATTEMPTS (5) failures per (email, client IP) lock that IP out of that email; LOCKOUT_ACCOUNT_MAX_ATTEMPTS (100) failures per email across all IPs lock every IP. Success clears that IP's count only (agent's call: the owner signing in mustn't reset a distributed attack's progress).
- **Alternatives:** per email+IP only (no account-wide brake); per-email lock with previously successful IPs exempt (more moving parts).
- **Gains:** a single IP can only lock itself out; distributed brute force still hits a ceiling.
- **Costs:** a botnet with enough IPs can still trigger the account-wide lock; the per-IP key depends on correct TRUST_PROXY (clients behind one NAT share a pair key).

### nginx resolves `api` at request time
- **Decided by:** agent (straight bug fix).
- **Choice:** `resolver 127.0.0.11 valid=10s` + `proxy_pass $api_upstream`.
- **Costs:** up to 10 s of failed requests right after the API's IP changes (DNS cache); one DNS lookup per 10 s.

### MongoDB stays a single-node replica set
- **Decided by:** user. Transactions and change streams work; no failover. Documented in docker-compose.yml.

### Log rotation: json-file with size caps
- **Decided by:** user. 10 MB × 5 files per container via a shared YAML anchor, env-overridable (LOG_MAX_SIZE / LOG_MAX_FILE).
- **Alternatives:** Docker `local` driver (compressed, but not readable by JSON-file log shippers); shipping logs off-host (OTLP logs already possible).
- **Costs:** older logs are lost locally after ~50 MB per container unless shipped.

### Resource limits: moderate profile
- **Decided by:** user (profile); values by agent.
- **Choice:** api 512 MB / 1 CPU, UV_THREADPOOL_SIZE=4 (≤ 4 concurrent argon2 hashes ≈ 256 MB), Node heap 256 MB; mongo 1 GB / 1 CPU, WiredTiger cache 0.25 GB; redis 64 MB / 0.25 CPU, maxmemory 48 MB with noeviction (errors rather than silently dropping lockout keys); web 64 MB / 0.5 CPU. All env-overridable.
- **Measured:** 40 concurrent sign-ups → all 201 in 12.8 s, API peak 356 MiB / 512 MiB, no OOM.
- **Costs:** sign-up/sign-in throughput is bounded by 4 hashes at a time on 1 CPU.

### Compose command detection for scripts
- **Decided by:** agent (bug fix: `dast.sh` failed with "unknown shorthand flag: 'p'" where `docker compose` isn't a working plugin).
- **Choice:** `scripts/lib/compose.sh` picks the first Compose ≥ 2.24 among `$COMPOSE`, `docker compose`, `docker-compose` and the usual plugin paths, or fails with a clear message.
- **Costs:** a small shared shell helper; plugin paths are Linux-specific (COMPOSE covers anything else).

### Production web port bound to WEB_BIND (default 127.0.0.1)
- **Decided by:** user (hardening option).
- **Why:** Docker-published ports bypass host firewalls, so `0.0.0.0:8080` would expose plain HTTP publicly around the load balancer's TLS/WAF. `check-prod-config.sh` now fails on a binding to every interface.
- **Costs:** deployments with the load balancer on another host must set `WEB_BIND` to the private interface; TRUST_PROXY stays the broad private ranges (a client on a private network could still spoof X-Forwarded-For — the stricter explicit list was not chosen).

### API image pinned to node:24.22.1-alpine
- **Decided by:** user.
- **Why:** mitigates CVE-2026-111497 (Brotli security bug in Node); `node:24-alpine` floats and could resolve to an unpatched build from cache.
- **Alternatives:** pin by digest (`node:24.22.1-alpine@sha256:…`, as the production-readiness review suggested); keep the floating tag.
- **Gains:** the patched release is visible in the Dockerfile; reproducible builds; easy to bump.
- **Costs:** a version tag can be re-pushed (a digest can't); the patch must be bumped by hand. `client/Dockerfile`'s build stage still uses `node:24-alpine` (build-time only, no traffic reaches it).
