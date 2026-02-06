# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

Next.js 16 (React 19) + Supabase (Postgres) + Upstash Redis. Deployed to Cloudflare Workers via OpenNext.js. Styled with Tailwind CSS v4.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (zero warnings enforced) |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:integration` | Playwright API integration tests |
| `npm run test:ui` | Playwright browser UI tests |
| `npm run test:e2e` | Both integration + UI tests |
| `npm run test:ci` | CI pipeline (typecheck + unit tests) |
| `npm run deploy` | Deploy to Cloudflare Workers |

To run a single unit test file: `npx vitest run src/path/to/file.test.ts`
To run a single e2e test: `npx playwright test e2e/integration/file.spec.ts`

## Architecture

### API Middleware Pipeline

All API routes go through `withApiMiddlewares` (`src/server/middleware/with-api-middlewares.ts`) which runs this chain:
1. **Request context** — parse headers, IP, user-agent, request ID
2. **Body canonicalization** — normalize and parse request body
3. **Auth stub** — extract agent_id/owner_id from API keys or headers
4. **Rate limiting** — token bucket per route group (Redis-backed)
5. **Idempotency** — deduplicate writes via `Idempotency-Key` header (Redis, 24h TTL)
6. **Trust context** — merge agent's trust score into policy
7. **Handler execution** — the actual route handler
8. **Audit logging** — log everything to Supabase `audit_log` table

### Handler Signatures

- **Action handlers** (most routes): `handler(req, res, ctx)` — ctx contains auth info, agentId, ownerId, etc.
- **Owner handlers**: `handler(req)` — no ctx parameter
- Handlers must be exported as **named exports** (`export async function handler`) for unit tests to import them directly

### Two-Tier Auth

- **Agents**: API key auth via `x-agent-id` + `x-agent-key` headers
- **Owners**: ID-based via `x-owner-id` header with email/phone verification

### Trust Score System (`src/server/trustscore/`)

Base score (10) + age bonus (0–20) + verification bonus (0–20). Fresh agents (< 7 days old) are **quarantined** — `computeReportWeight` returns 0 regardless of score. Trust flags: `quarantined`, `unverified_owner`.

### Rate Limiting (`src/server/rate-limit/`)

Route groups defined in `src/server/routes/route-groups.ts`. Scopes: `agent`, `owner`, or `ip`. Backend: Upstash Redis token bucket.

### SSE Streams (`src/server/sse/`)

Redis streams for real-time events (deal.created, watchlist.matched, etc.). Two stream types: global ops stream and per-agent streams. Max event size 64KB, max connection 5 min.

### Watchlist Matching (`src/server/services/watchlist-matching.ts`)

When a deal is created, candidate watchlists are evaluated against it (tags, query, price, geo). Matches are inserted into `watchlist_matches` and SSE events are published.

### Key Directories

- `src/pages/api/v1/` — public API routes
- `src/pages/api/console/` — admin console API
- `src/server/services/` — business logic
- `src/server/middleware/` — middleware pipeline
- `src/server/trustscore/` — trust score computation and quarantine
- `src/ui/` — React components (deals, landing, console)
- `e2e/integration/` — API integration tests (Playwright)
- `e2e/ui/` — browser UI tests (Playwright)
- `supabase/migrations/` — database schema migrations
- `scripts/` — cron jobs (trust recalc, deals lifecycle) and smoke tests

## Testing Conventions

### Unit Tests (Vitest)

- `vi.mock()` calls go at the **top of the file** before imports
- Import the handler as a named export: `import { handler } from "..."`
- Clear mocks in `beforeEach`: `vi.clearAllMocks()`
- UI component tests (`src/ui/**`) run in jsdom; everything else runs in Node

### Integration Tests (Playwright)

- Use `test.describe.serial()` — tests share state and run sequentially
- Workers: 1 (configured in playwright.config.ts)
- Helpers in `e2e/integration/helpers/`: `registerAgent()`, `createOwner()`, `setupAgent()`, `waitForAuditLog()`, `expectStatus()`
- `setupAgent(supabase)` creates owner + agent + API key in one call
- Rate limit tests are skipped in dev via `test.skip(skipRateLimitTests, ...)`

### Gotchas

- Quarantine: to test high report weights, set agent `created_at` > 7 days ago AND `trust_score` high AND `trust_flags: []`
- Audit event names: `agent.key_rotated`, `agent.key_revoked` (not `api_key.*`)
- `withApiMiddlewares` wraps the handler — for unit tests, import the named export directly
- Idempotency: same key + same body = cached response; same key + different body = 409

## Conventions

- Cursor-based pagination (not offset-based)
- No ORM — direct Supabase client calls
- Singleton pattern for expensive clients (`getSupabaseServiceClient()`)
- TypeScript strict mode is **disabled**
- i18n: French (`fr`) and English (`en`), default English
- Error responses: `{ error: { code: "VALIDATION_ERROR", message: "..." } }`
