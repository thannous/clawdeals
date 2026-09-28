# Repository Guidelines

## Scope and references

Read only the code and documentation needed for the task. Documentation-only or copy-only edits do not require application test suites.

- This app uses Next.js Pages Router: UI in `src/pages/`, APIs in `src/pages/api/`, server code in `src/server/`.
- For Next.js API, routing, or configuration changes, consult the relevant guide in `node_modules/next/dist/docs/`. This is the scope of the generated Next.js guidance below; it is not a prerequisite for unrelated edits.
- For local database or integration-test setup, use `docs/local-supabase-development.md` and `playwright.config.ts`.
- For hosting or deployment changes, use `docs/hosting-cloudflare-vercel.md`: `clawdeals.com` uses `workers/edge-router.ts`; `app.clawdeals.com` uses Vercel Git integration.
- Find other task-specific references in `docs/`; commands are defined in `package.json`. Update affected documentation when behavior or workflows change.

## Validation and autonomy

- Current development phase (owner-confirmed 2026-09-28): production has no real users and contains fictitious, disposable data. Production is an authorized target for development validation, including integration, smoke, and E2E tests that create, modify, or delete test data. The Vercel project `clawdeals-staging` was deleted on 2026-09-28; its former `sandbox.clawdeals.com` endpoint is retired. A separate sandbox/staging environment is not a prerequisite. Revisit this policy when real users or real data are introduced.
- Choose checks for the changed behavior and risk. Do not run broad suites solely because a file changed. Available checks include `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:ui`, and `npm run test:integration`. Scoped integration scripts cover deals, listings, transactions, escrow, and dispute.
- Prefer E2E coverage for behavior changes. Add an isolation test only for a documented failure that E2E coverage misses; identify that failure first. Prefer writing the test before implementation; a concrete defect discovered afterward may receive a focused regression test. Avoid tests that merely repeat copy, implementation details, or mocked calls.
- Run relevant tests, fix failures caused by the requested change, and rerun affected checks without asking for approval at each step, including against production during the development phase above. This permission covers test-data operations, not unrelated destructive infrastructure changes, real payments, or messages to third parties.
- Playwright loads `.env.local`; verify the actual target rather than inferring it from the local app URL. Playwright, integration helpers and smoke support `CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS=gztfmpuqtpvncdcuhqxy` on local test commands. Other projects, hosted Vercel runtimes, migration exporters and sandbox resets remain protected. Use fixtures appropriate to the selected target; see `docs/release-environments.md`.
- For E2E runs, retain a report or trace and provide the exact rerun command, safe target, fixture prerequisites, and results, including skipped or blocked checks. `npm run test:ci` is a contract suite, not evidence of browser QA or deployment.

## Changes and release

- Follow existing TypeScript/React conventions: 2-space indentation, semicolons, double quotes; components `PascalCase.tsx`, utilities `camelCase.ts`, tests `*.test.ts(x)`, E2E `*.spec.ts`.
- Preserve unrelated work. Do not commit generated `.next/`, `.open-next/`, `coverage/`, or `test-results/` output.
- Work directly on `main`; do not create branches or PRs. If starting in a detached worktree, preserve and report that state rather than switching branches or moving unrelated work.
- Commit only when authorized, using the existing style (`feat(scope):`, `fix:`, `refactor:`, `test:`, `chore:`) and ticket IDs when applicable.
- The current release workflow is a direct push to `main`, followed by automatic Vercel production deployment; no staging promotion is required. An authorized push includes that automatic deployment. Manual deployments, including `npm run deploy:cloudflare`, and unrelated destructive or external actions still require authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
