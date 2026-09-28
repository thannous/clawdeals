# Repository Guidelines

## Scope and references

Read only the code and documentation needed for the task. Documentation-only or copy-only edits do not require application test suites.

- This app uses Next.js Pages Router: UI in `src/pages/`, APIs in `src/pages/api/`, server code in `src/server/`.
- For Next.js API, routing, or configuration changes, consult the relevant guide in `node_modules/next/dist/docs/`. This is the scope of the generated Next.js guidance below; it is not a prerequisite for unrelated edits.
- For local database or integration-test setup, use `docs/local-supabase-development.md` and `playwright.config.ts`.
- For hosting or deployment changes, use `docs/hosting-cloudflare-vercel.md`: `clawdeals.com` uses `workers/edge-router.ts`; `app.clawdeals.com` uses Vercel Git integration.
- Find other task-specific references in `docs/`; commands are defined in `package.json`. Update affected documentation when behavior or workflows change.

## Validation and autonomy

- Choose checks for the changed behavior and risk. Do not run broad suites solely because a file changed. Available checks include `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:ui`, and `npm run test:integration`. Scoped integration scripts cover deals, listings, transactions, escrow, and dispute.
- Prefer E2E coverage for behavior changes. Add an isolation test only for a documented failure that E2E coverage misses; identify that failure and write the test before implementation. Avoid tests that merely repeat copy, implementation details, or mocked calls.
- Once a test workflow is confirmed to use disposable fixtures and no production access, run it, fix failures caused by the requested change, and rerun affected checks without asking for approval at each step.
- Playwright loads `.env.local`; a local app URL alone does not establish isolation. Use local services or isolated staging with synthetic data and no production secrets for integration, smoke, and E2E tests. Keep production-target guards enabled.
- For E2E runs, retain a report or trace and provide the exact rerun command, safe target, fixture prerequisites, and results, including skipped or blocked checks. `npm run test:ci` is a contract suite, not evidence of browser QA or deployment.

## Changes and release

- Follow existing TypeScript/React conventions: 2-space indentation, semicolons, double quotes; components `PascalCase.tsx`, utilities `camelCase.ts`, tests `*.test.ts(x)`, E2E `*.spec.ts`.
- Preserve unrelated work. Do not commit generated `.next/`, `.open-next/`, `coverage/`, or `test-results/` output.
- Work directly on `main`; do not create branches or PRs. If starting in a detached worktree, preserve and report that state rather than switching branches or moving unrelated work.
- Commit only when authorized, using the existing style (`feat(scope):`, `fix:`, `refactor:`, `test:`, `chore:`) and ticket IDs when applicable.
- Production deployment requires explicit authorization, including `npm run deploy:cloudflare`. Destructive or external actions must stay within the user's authorized scope.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
