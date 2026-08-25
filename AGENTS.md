# Repository Guidelines

## Operating Principles

- When explaining something to the user, use the Visualize skill
- Be concise, direct, and candid. Challenge weak assumptions and distinguish verified facts from uncertainty
- Ground research in authoritative, current sources and link important evidence
- Preserve the original goal and constraints; finish authorized work end to end and verify the actual result before claiming completion
- Ask questions only when a decision is materially ambiguous, risky, or requires approval
- Use relevant skills; spawn subagents only for genuinely independent work and synthesize their findings
- Keep changes focused and simple. Avoid unrelated edits, unnecessary abstractions, and low-signal tests
- Test observable behavior, review substantial changes, and validate user-facing work in the real interface when applicable
- Preserve unrelated work and never take destructive, production, or external actions beyond what the user authorized
- Report meaningful blockers, outcomes, and evidence without noisy progress

## Project Map

- Next.js Pages Router: UI in `src/pages/`, APIs in `src/pages/api/`; server code in `src/server/`.
- Shared UI/theme/styles: `src/ui/`, `src/theme/`, `src/styles/` (Tailwind CSS).
- Tests: Vitest in `src/__tests__/` and `src/**/*.test.{ts,tsx}`; Playwright in `e2e/ui/` and `e2e/integration/`.
- Operations: assets in `public/`, migrations in `supabase/migrations/`, scripts in `scripts/`, runbooks/specs in `docs/`.
- Production topology: `clawdeals.com` is routed by `workers/edge-router.ts`; `app.clawdeals.com` is deployed through Vercel Git integration. See `docs/hosting-cloudflare-vercel.md`.

## Essential Commands

- Install/run: `npm ci`, `npm run dev`, `npm run build`, `npm run start`.
- Validate: `npm run lint`, `npm run typecheck`, `npm run test:unit`, or the full `npm run test:ci`.
- Browser tests: `npm run test:ui`, `npm run test:integration`, `npm run test:e2e`.
- Scoped integration: `npm run test:integration:{deals,listings,transactions,escrow,dispute}`.
- Cloudflare: `npm run preview:cloudflare`; `npm run deploy:cloudflare` only when production deployment is explicitly authorized.

## Code, Tests, and Release

- Use TypeScript/React patterns already present: 2-space indentation, semicolons, double quotes; components `PascalCase.tsx`, utilities `camelCase.ts`, tests `*.test.ts(x)`, E2E `*.spec.ts`.
- Vitest uses Node by default and `jsdom` for `src/ui/**`. Playwright starts the app unless `E2E_BASE_URL` is set; useful overrides include `E2E_DEV_PORT` and `API_BASE_URL`.
- Remote integration, smoke, and E2E tests must use isolated staging with synthetic data, never production data or production secrets.
- Do not commit generated `.next/`, `.open-next/`, `coverage/`, or `test-results/` output.
- Work directly on `main`: do not create branches or PRs. When a commit is authorized, use the existing style (`feat(scope):`, `fix:`, `refactor:`, `test:`, `chore:`) and include ticket IDs when applicable.
