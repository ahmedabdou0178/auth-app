# CLAUDE.md — rules for AI coding agents

Full-stack auth module: NestJS 12 + MongoDB API (`server/`), React 19 + Vite web app (`client/`), shared zod schemas/types/error codes (`shared/`). Design and requirements: `SPEC.md`. Decisions and their trade-offs: `tradeoffs.md` (internal, git-ignored).

## Commands

```bash
nvm use && corepack enable && pnpm install
docker compose up -d mongo     # local MongoDB (needs .env from .env.example)
pnpm dev                       # API :3000 + web :5173
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:security             # Semgrep + ZAP (Docker)
pnpm --filter @auth-app/server test   # one workspace
```

Run the full check chain above and read its real output before claiming anything passes.

## Workflow

- **Ask the author before any new design decision**, then record it (choice, alternatives, trade-off, who decided) in `tradeoffs.md`.
- **Don't commit unless the author asks.** When asked: small conventional commits (`feat(server): …`, `test(client): …`), and only after the full check chain passes.
- **Never stage `.md` files** unless the author asks (`*.md` is git-ignored; they're added with `git add -f`). `tradeoffs.md` and `AI_NOTES_FOR_AUTHOR.md` are never committed.
- Log phases, alternatives chosen, own bugs fixed and open doubts in `AI_NOTES_FOR_AUTHOR.md`.
- Don't invent content for `AI.md`; it is the author's account.

## Code rules

### Naming

| What | Convention | Examples |
| ---- | ---------- | -------- |
| Files (TS) | kebab-case + role suffix | `auth.service.ts`, `session-cookies.ts`, `csrf.guard.ts`, `json-body.middleware.ts`, `user.schema.ts`, `auth.dto.ts` |
| React component files | PascalCase, one component per file | `SignUpPage.tsx`, `PasswordField.tsx` |
| Tests | next to the code they test | `*.spec.ts` (server unit), `test/*.e2e-spec.ts` (server e2e), `*.test.ts(x)` (client, shared) |
| Classes, components, types, interfaces | PascalCase, no `I` prefix | `SessionsService`, `AuthContextValue`, `ApiError` |
| Functions, variables, methods | camelCase, verbs for functions | `readTokenCookie`, `registerFailure`, `toUserDto` |
| Booleans | `is` / `has` / `should` / `can` | `isPublic`, `hasValidToken`, `telemetryEnabled` |
| Module-level constants, env vars, error codes | UPPER_SNAKE_CASE | `SESSION_COOKIE`, `LOCKOUT_MAX_ATTEMPTS`, `INVALID_CSRF_TOKEN` |
| React hooks | `use` prefix | `useAuth` |
| Mongo collections | snake_case plural | `users`, `sessions`, `refresh_tokens` |
| URL paths | lowercase, kebab-case | `/api/auth/signup`, `/api/users/me` |
| Names describe the domain, not the mechanism | `retryAfterSeconds`, not `getValue2`; no abbreviations except well-known ones (`id`, `ip`, `url`, `csrf`, `dto`) | |

### Simple, readable code

- Small, single-purpose files and functions. If a function needs a comment to explain *what* it does, split or rename it.
- Prefer early returns over nested `if`/`else`; one level of abstraction per function.
- Make types explicit at module boundaries (exported functions, service methods, API types); let TypeScript infer locals.
- No clever one-liners, no premature abstraction or "utils" dumping grounds; duplicate twice before extracting, extract on the third use.
- Comments explain **why** (a constraint, a trade-off, a library quirk), never restate the code. Use JSDoc on exported functions whose behaviour isn't obvious.
- No dead code, commented-out code, `console.log`, `any`, non-null assertions without a reason, or lint/type disables. Fix the cause.
- Keep framework idioms: Nest modules/providers/guards/pipes on the server, hooks and components on the client. Don't fight the framework.
- Errors: throw `AppException` with an `ErrorCode` from `shared/`; never return ad-hoc error shapes. Validation goes through the shared zod schemas only.
- Imports: Node built-ins, then packages, then `@auth-app/shared`, then relative. Server relative imports end in `.js` (NodeNext).
- Formatting is Prettier's job (`pnpm format`); don't hand-format.

### Tests for every feature

- Every feature or behaviour change ships with tests in the same change:
  - **Server:** unit tests for services, guards, stores and pure logic; an **e2e test** for every endpoint behaviour (status code, body shape, cookies, headers).
  - **Client:** Testing Library tests through the real `routes` for every page or flow; unit tests for the HTTP client and other non-UI logic.
  - **Shared:** a test for every schema rule and boundary.
- **Bug fixes start with a failing test** that reproduces the bug, then the fix.
- Cover the failure paths, not just the happy path (invalid input, 401/403/409/429, expired or missing state).
- If a new test passes on the first run, prove it can fail: break the code briefly, watch it fail, restore.
- Tests are deterministic: no real network or external services (in-memory Mongo, ioredis-mock, a fake axios adapter, mocked `api/auth-api`), fake timers for time-based logic.
- Test names describe behaviour (`'locks only the failing IP, so an attacker cannot lock the owner out'`), not implementation.
- Query the UI like a user: by role, label and text (`getByRole`, `getByLabelText`); `data-*` attributes only for state that has no accessible equivalent.

### UI

- Every input has a `<label>`, `aria-invalid` and `aria-describedby`; errors use plain-language messages from the shared schemas.
- Keyboard and screen reader friendly (visible focus, `role="alert"` for form errors, accessible names on icon buttons); works at 360 px.
- Tailwind theme tokens only (`@theme` in `index.css`); no inline styles (the CSP forbids them) and no external fonts or scripts.

## Invariants (don't break)

- Field rules live only in `shared/src/schemas.ts`; the API validates with the same schemas (`ZodValidationPipe`).
- Auth is a **server-side session** (`sid` cookie, 15 min, fixed) + **non-rotating** refresh token (stored as SHA-256). No JWT, no tokens in Web Storage; the only token in JS is the CSRF token, in memory.
- CSRF: synchronizer token (`X-CSRF-Token`) on unsafe requests with a session; `Origin` + `X-Requested-With: fetch` on session-less cookie routes (`@Csrf('origin' | 'none')` to change per route).
- Read cookies with `readTokenCookie()` (strings only — blocks `j:` object injection into Mongo queries).
- Same `401 "Invalid email or password"` for unknown email and wrong password; keep the dummy argon2 verify.
- Lockout is two-level (`LockoutService`): per email + client IP, and per email across IPs at a higher ceiling. Never go back to a per-email-only lock (anyone could lock the owner out).
- Never log passwords, hashes, session IDs, CSRF or refresh tokens, or emails (use `emailLogHash`).
- Every error goes through `AllExceptionsFilter` / `AppException` with an `ErrorCode` from `shared/`.

## Conventions

- pnpm 12 only (`pnpm --filter <pkg> …`); never create `package-lock.json` or `yarn.lock`. Supply-chain settings live in `pnpm-workspace.yaml`; every `allowBuilds` / `trustPolicyExclude` entry needs a comment with its reason.
- Node 24 (≥ 24.11.1), TypeScript 6 `strict`. Verify library APIs against the installed versions (`pnpm why <pkg>`, the installed `.d.ts`) before using them.
- Server code is CommonJS with NodeNext `.js` import specifiers; NestJS 12 itself is ESM.
- No lint/type disables and no `any` — fix the cause.
- Tests: Jest (server, `--experimental-vm-modules`), Vitest + Testing Library (client, shared). Client tests mock `api/auth-api` (no MSW); page tests mount the real `routes`.
- Security scans: fix findings rather than suppress them; every accepted ZAP alert needs a reason in `scripts/security/zap-*-rules.tsv`.
