# Repository Guidelines

## Project Structure & Module Organization
- `src/pages/`: Next.js Pages Router (UI routes). API routes live in `src/pages/api/`.
- `src/server/`: server-side modules (DB/services/middleware, SSE, rate limiting, etc.).
- `src/ui/`, `src/theme/`, `src/styles/`: shared UI components, theming, and styling (Tailwind CSS).
- `src/__tests__/` and `src/**/*.test.{ts,tsx}`: unit/API tests (Vitest).
- `e2e/ui/`, `e2e/integration/`: Playwright end-to-end suites (`*.spec.ts`).
- `public/`: static assets.
- `supabase/migrations/`: database migrations.
- `scripts/`: operational scripts (cron jobs, smoke checks).
- `docs/`: product/spec documents and test coverage notes.

## Build, Test, and Development Commands
- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: run Next.js locally.
- `npm run build` / `npm run start`: production build + serve.
- `npm run lint`: ESLint (fails on warnings).
- `npm run typecheck`: TypeScript check (`tsc --noEmit`).
- `npm run test:unit`: run Vitest suite.
- `npm run test:e2e`: run all Playwright projects.
- `npm run test:ui` / `npm run test:integration`: run a specific Playwright project.
- `npm run preview` / `npm run deploy`: OpenNext Cloudflare build + preview/deploy.

## Coding Style & Naming Conventions
- TypeScript + React/Next.js; keep changes consistent with existing patterns.
- Lint rules are defined in `eslint.config.mjs` (Next Core Web Vitals).
- Prefer 2-space indentation, semicolons, and double quotes (matches current codebase).
- Naming: React components `PascalCase.tsx`; utilities `camelCase.ts`; tests `*.test.ts(x)`; e2e specs `*.spec.ts`.
- Don’t commit generated output (gitignored): `.next/`, `.open-next/`, `coverage/`, `test-results/`.

## Testing Guidelines
- Vitest runs Node tests by default; UI tests under `src/ui/**` use `jsdom` (see `vitest.config.ts`).
- Playwright starts `npm run dev` automatically unless `E2E_BASE_URL` is set; useful vars: `E2E_DEV_PORT`, `API_BASE_URL`.
- Add/adjust tests when changing API behavior, matching logic, or UI flows.

## Commit & Pull Request Guidelines
- Follow the existing commit style: `feat(scope): ...`, `fix: ...`, `refactor(ts): ...`, `test: ...`, `chore: ...`.
- Include ticket references when applicable (e.g., `TI-192`) in the commit or PR description.
- PRs should include: a clear behavior summary, tests run (at least `npm run test:ci`), and screenshots for UI changes; call out new `supabase/migrations/*` explicitly.

