# User Authentication App

Sign up, sign in, a protected application page and logout. NestJS + MongoDB API, React + TypeScript web app, with the field rules shared by both. Design and decisions: [SPEC.md](SPEC.md). AI usage: [AI.md](AI.md).

## Run with Docker

Requires Docker with Compose v2.24+.

```bash
cp .env.example .env
# Replace every "replace-me" with a random value (openssl rand -hex 24).
# MONGO_APP_PASSWORD and the password inside MONGODB_URI must be the same.
docker compose up --build
```

Open **http://localhost:5173**. Stop and remove everything with `docker compose down -v`.

## Run locally

Requires Node.js 24 (`nvm use`), corepack and Docker (for MongoDB).

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env               # fill in as above
docker compose up -d mongo
pnpm dev
```

| Service    | URL                              |
| ---------- | -------------------------------- |
| Web app    | http://localhost:5173            |
| API        | http://localhost:3000/api        |
| Swagger UI | http://localhost:3000/api/docs   |
| Health     | http://localhost:3000/api/health |

## Production deployment

CI publishes `ghcr.io/<owner>/auth-app-api` and `ghcr.io/<owner>/auth-app-web`. Deploy them with the production overlay behind a load balancer that terminates TLS:

```bash
export GHCR_OWNER=<owner> IMAGE_TAG=<commit sha or latest> CORS_ORIGIN=https://app.example.com
export WEB_BIND=10.0.1.5   # the private address the load balancer connects to
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
```

| Setting | Value | Why |
| ------- | ----- | --- |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Trusts only private-network hops (load balancer and nginx), so the rate limits and the lockout see the real client IP and clients can't fake `X-Forwarded-For` |
| web port | `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}` | Plain HTTP for the TLS load balancer only. Docker-published ports bypass host firewalls, so never bind it to `0.0.0.0`; set `WEB_BIND` to the private interface the load balancer uses |
| `COOKIE_SECURE` / `SWAGGER_ENABLED` | `true` / `false` | Pinned; CI's `scripts/check-prod-config.sh` fails on anything else, and on a non-`https` `CORS_ORIGIN` |

MongoDB isn't published on the host in production. Passwords (`MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `REDIS_PASSWORD`) come from a secret store, never from the repo.

## Scripts

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | API (watch) + web app                          |
| `pnpm build`         | Build all packages                             |
| `pnpm test`          | All tests (shared, API unit + e2e, web)        |
| `pnpm lint`          | ESLint                                         |
| `pnpm typecheck`     | TypeScript checks                              |
| `pnpm format`        | Prettier (`format:check` in CI)                |
| `pnpm test:security` | Semgrep + OWASP ZAP (needs Docker)             |

## Repository

```
client/   React web app
server/   NestJS API
shared/   validation schemas, types, error codes
scripts/  security scans, production config check
```

Configuration comes from the repo-root `.env` (template: `.env.example`); the API validates it at startup and exits with a readable error if anything is wrong.
