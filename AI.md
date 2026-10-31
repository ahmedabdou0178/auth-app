# AI Usage

> Compiled from verifiable records only: the git history (20 commits), the agent's running log (internal document `AI_NOTES_FOR_AUTHOR.md`), the decision log (`tradeoffs.md`) and the session transcripts.

## Tools used

- **Claude Code** (Anthropic's CLI agent) did almost all of the work: planning with me, code, tests, configuration, docs, running commands and checks. The production-readiness review near the end ran on **Claude Opus 5.5 for planning and reviewing, Sonnet 5.5 for implementation and, Haiku 5.5 for writing tests**.
- **Chrome DevTools MCP**, driven by Claude Code, for checks in a real browser: sign-up/sign-in, reload, refresh after expiry, logout, `document.cookie` and Web Storage contents, 360px layout and CSP errors. These ran on both the dev servers and the Docker build.
- **`gh` CLI** to look up current GitHub Action releases and their commit SHAs. **actionlint** and **shellcheck** to validate the workflow and shell scripts. **Semgrep** and **OWASP ZAP** (run by the agent through `scripts/security/`) for SAST and DAST.

## What was AI-assisted

Nearly the whole repository. The work followed `SPEC.md` step by step, with one checkpoint and one commit per step:

| Area | AI-assisted work |
|---|---|
| Planning | Read the task pdf, then turned every open design question into a decision register (USER / KEEP / OPEN) that I answered in batches. Wrote `SPEC.md` around my answers and kept `tradeoffs.md` with one entry per decision. |
| `shared/` | zod schemas, the password-rule checklist (built from the same constants as the schema so the two can't drift), error codes, API types, header constants, tests. |
| `server/` | Env validation, pino logging with request IDs and redaction, global error filter, Swagger, health check, users, server-side sessions + non-rotating refresh token, synchronizer-token CSRF guard, argon2id sign-up/sign-in, Redis-backed rate limiting and lockout (atomic Lua scripts with in-memory fallbacks), OpenTelemetry, Jest unit + e2e tests. |
| `client/` | axios client with the CSRF token held in memory and a single shared refresh request, `AuthProvider`, route guards, accessible form components, the four pages, Vitest + Testing Library tests. |
| Infra | Dockerfiles, nginx config, Compose stack and production overlay, `check-prod-config.sh`, GitHub Actions CI/CD, Semgrep/ZAP scripts and rule files, `scripts/lib/compose.sh`. |
| Hardening pass | A production-readiness review, followed by fixes for the issues it found (see below). |
| Docs | All docs in the repo.  |

## Prompts and approaches that worked well

**Decisions before code.** Two things I stated up front ("I will use pnpm", "server-side session cookie with refresh token, no rotation"), together with an instruction to ask about all open decisions before implementing, gave a full decision register before any code existed. Each later choice, including the agent's own calls, was then logged in `tradeoffs.md` with its alternatives and costs. That log is what made the review and fix rounds fast: every question already had a recorded answer and a reason.

**A spec written for the agent, plus a `CLAUDE.md` of hard rules.** Examples: "verify library APIs against the installed versions", "no lint/type disables", "never log tokens", "ask before any new design decision". These rules caught real problems. Checking the installed packages found:
- body-parser errors bypass Nest exception filters in NestJS 12;
- throttler storage reports time in seconds, not milliseconds;
- `BatchLogRecordProcessor` takes an options object in sdk-logs 3;
- pnpm 12 renamed `onlyBuiltDependencies` to `allowBuilds`;
- TypeScript 7 and ioredis 6 aren't supported yet by typescript-eslint, ts-jest, @nestjs/swagger and ioredis-mock, so TS 6 and ioredis 5 were used.

**Checkpoints that require real output.** Each step ended with the full check chain (`format:check → lint → typecheck → test → build`). The agent then checked flows by hand on top of the tests: curl against the API, then the browser, then the Docker build.

**Mutation checks to prove the tests catch regressions.** The agent deliberately broke the code to confirm the tests would fail:

| Deliberate break | Tests that failed |
|---|---|
| CSRF token check forced to pass | 5 |
| Lockout check disabled | 3 |
| Shared refresh request (`refreshInFlight ??=`) changed to `=` | 2 |
| CSRF-403 retry branch removed | 3 |
| Lockout key ignoring the client IP | 6 |

**Asking for a review of my own app ("is it production ready?").** This produced a ranked list with file and line references and a short "what's already good" section. Two things made it useful rather than generic:
- It separated issues the agent could fix directly and log from design choices that were mine to make.
- It distinguished advisories that are present from ones that are actually reachable. For example, the `multer` advisory is in the dependency tree but the app has no upload routes.

Asking the same question again after each round of fixes gave an updated list. Each answer marked what was fixed, what was only partly fixed and what was still open, without repeating closed items.

**Reproduce first, then fix.** For the nginx stale-DNS bug, the agent first reproduced the 502s by forcing the API container onto a new IP, then fixed the config and confirmed it under the same conditions. For the multi-tab logout bug, the tests were written first (3 failed), then the fix, then a real two-tab browser run.

## What I had to correct or rework

**Bugs in the AI's output, found by tests, scans or manual checks, then fixed:**
- `/api/health` returned 401 once the global session guard was added: health wasn't marked public.
- Swagger `@ApiCookieAuth('sid')` pointed at a security scheme that didn't exist, because `addCookieAuth` names the scheme `cookie` by default.
- `cookie-parser` turns `j:`-prefixed cookie values into objects, so `sid=j:{"$ne":null}` could reach a Mongo query as an operator. Cookies are now accepted only as strings of at most 128 characters.
- Named throttlers sent only `Retry-After-auth`. A small guard subclass now sends the standard `Retry-After`.
- Paths outside `/api` returned Express's HTML 404. The ZAP API scan caught it on its second run; those paths now return the standard JSON error.
- A failed logout caused an unhandled promise rejection.
- `module.register()` is deprecated on Node 24. The OpenTelemetry ESM hook moved to `module.registerHooks()`, which raised the minimum Node version to 24.11.1.
- A test wrongly assumed the CORS middleware omits `Access-Control-Allow-Origin` for foreign origins. With a fixed origin it always sends the configured one, and the browser then blocks the request.

**Issues the production-readiness review found** (the code passed every test, but it wasn't ready for production):
- **Logout broke with two tabs open.** Tabs share the `sid` cookie but each keeps its own in-memory CSRF token. Once one tab refreshed the session, the other tab's logout returned 403 on every retry. The client now re-reads the token and retries once.
- **Anyone could lock any account.** The lockout was per email only, so five deliberate failures from one IP locked out the real owner. It became a two-level lockout (see the next section).
- **nginx resolved `api` only once, at startup**, so recreating the API container caused 502s until nginx restarted.
- **No log rotation, no resource limits**, and two high-severity dependency advisories. These were fixed with log rotation and container limits in Compose, and pnpm `overrides` for the advisories (each pinned version has its reason written next to it).
- **The production web port was published on every interface.** Docker-published ports bypass the host firewall, so plain HTTP could reach the internet around the load balancer's TLS. The port now binds to `WEB_BIND` (default `127.0.0.1`), and the CI production-config check fails on `0.0.0.0`.

**Process slips by the agent:**
- One commit (OpenTelemetry) went in with lint and format failing because committing wasn't gated on the checks. It was fixed in the next commit, and every commit after that was gated.
- The first nginx verification run didn't actually change the container's IP, so it proved nothing. It was redone with the IP forced to change.
- Smaller slips: a wrong `express` version installed first, `^` ranges saved despite `saveExact`, a `pkill` pattern that killed the agent's own shell, and shell mistakes while running local checks.

**Still open:**
- `server/test/setup-env.ts` imports `@nestjs/common` without waiting for it. This causes "import after the Jest environment has been torn down" noise in test output.

## Decisions I made differently from the AI's suggestions

| Topic | AI suggested | I chose | Why / cost |
|---|---|---|---|
| Session ID storage | Store SHA-256 hashes, as refresh tokens are | Store `sessionId` and `csrfToken` raw | Simpler direct lookup. Cost: a database read leak exposes live sessions for up to 15 minutes. Mitigated by the short TTL, hashed refresh tokens and a least-privilege DB user. |
| Planning flow | A second batch of follow-up questions | Declined that batch and had the agent write a full decision register, which I answered in batches | User needed to identify all the gaps and decisions upfront to grasp the whole idea before starting implementation.  |
| pnpm version | The locally installed 10.x | 12.16.1, the current stable (pnpm has no LTS tag) | Fails on unknown settings in `pnpm-workspace.yaml`, so a typo can't silently drop `minimumReleaseAge`. |
| MongoDB topology | Flagged a single node with no failover as a production gap | Kept a single-node replica set | Transactions and change streams work. No failover, documented in `docker-compose.yml`. |
| Proxy trust in production | A stricter, explicit list of trusted IPs was offered | Kept the broad private ranges, but bound the web port to `WEB_BIND` | Simpler to deploy. Cost: a client on a private network could still spoof `X-Forwarded-For`. |
| Node base image | The review flagged the floating `node:24-alpine` tag as unreproducible and suggested pinning images by digest | Pinned the exact release `node:24.22.1-alpine` in `server/Dockerfile` to mitigate CVE-2026-111497 (a Brotli security bug in Node) | The tag names the patched Node release, so it's easy to see the fix is in and to bump later. Cost: a version tag can be re-pushed, unlike a digest. |

**Choices that were mine but not disagreements.** Here I either picked from the agent's options or decided where it had proposed nothing:
- **Lockout redesign:** I picked "per email + IP (5 attempts) plus an account-wide ceiling (100)". The agent added that a successful sign-in clears only that IP's count, so the owner signing in can't reset a distributed attack.
- **Log rotation and resource limits:** `json-file` at 10 MB × 5 files per container, and a moderate limits profile.
- **`restart: always`** on every Compose service.
- **Git workflow:** I made every commit myself at each checkpoint.