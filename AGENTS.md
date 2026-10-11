# Repository Guidelines

## Scope and references

Read only the code and documentation needed for the task. The generated Next.js block below applies to Next.js APIs, routing and configuration compatibility; it is not a requirement to reload framework docs before unrelated edits.

- This app uses Next.js Pages Router: UI in `src/pages/`, APIs in `src/pages/api/`, server code in `src/server/`.
- For Next.js API, routing, or configuration changes, consult the relevant guide in `node_modules/next/dist/docs/`. This is the scope of the generated Next.js guidance below; it is not a prerequisite for unrelated edits.
- For local database or integration-test setup, use `docs/local-supabase-development.md` and `playwright.config.ts`.
- For browser tests, use the E2E policy below and `docs/testerarmy-e2e.md`.
- For hosting or deployment changes, use `docs/hosting-cloudflare-vercel.md`: `clawdeals.com` uses `workers/edge-router.ts`; `app.clawdeals.com` uses the Vercel project with explicit release approval; automatic Git deployments are disabled.
- Find other task-specific references in `docs/`; commands are defined in `package.json`. Update affected documentation when behavior or workflows change.

## Current operating policy (owner, 2026-10-06)

Current user scope and functional requirements govern. Older choices, memories and
historical assertions are context and may be revised with a stated reason. Evaluate
new functionality and compatible tools by their actual behavior; adopt a successful
bounded pilot within the authorized task without asking again at each step.
Keep factual old results honest, revise the active contract when behavior changes,
and preserve still-relevant uncovered coverage. Mandatory platform/security checks,
personal data, secrets and existing provider/spending boundaries stay protected.
Complete necessary reversible local edits and checks autonomously within the
authorized task, preserving unrelated work and environments.

## Validation and autonomy

- Current development phase (owner-confirmed 2026-09-28): production has no real users and contains fictitious, disposable data. Development validation may create, modify, or delete test data there. The former hosted staging project is retired; a separate sandbox/staging environment is not a prerequisite. Revisit this policy when real users or real data are introduced.
- Choose checks for the changed behavior and risk. Documentation-only or copy-only edits need diff/link checks, not application suites. Available checks and scoped integration commands are in `package.json`; do not run broad suites solely because a file changed.
- Prefer E2E coverage for behavior changes. Add an isolation test only for a documented failure that E2E coverage misses; identify that failure first. Prefer writing the test before implementation; a concrete defect discovered afterward may receive a focused regression test. Avoid tests that merely repeat copy, implementation details, or mocked calls.
- Run relevant tests, fix failures caused by the requested change, and rerun affected checks without asking for approval at each step, including against production during the development phase above. This permission covers test-data operations, not unrelated destructive infrastructure changes, real payments, or messages to third parties.
- Verify the actual backend rather than inferring it from a local app URL. `docs/release-environments.md` is the reference for supported test commands, the ClawDeals-only disposable-production opt-in, credentials and fixture requirements. Other projects, hosted Vercel runtimes, migration exporters and sandbox resets remain protected.
- Retain one useful report/trace, the primary failure and relevant log/media, source/build identity, exact rerun command, target and fixture prerequisites. Report skipped/blocked checks and distinguish local, CI and deployed evidence; a reused result is not a fresh run. Exhaustive archives and duplicate downloads/rehashes are not release gates. `npm run verify:pr` (and `npm run test:ci`, the same contracts in the checkout, without lint or proof) is a contract suite, not evidence of browser QA or deployment.

## Livraison

1. Avant de push, l'agent lance `npm run verify:pr` sur sa machine. Si ça échoue, il ne pousse pas.
2. La PR indique le commit vérifié et le résultat.
3. Le CTO relit et merge quand les commentaires sont réglés et que rien ne bloque.
4. Rien ne part en prod sans le go de thanh.

## Changes and release

- Follow existing TypeScript/React conventions: 2-space indentation, semicolons, double quotes; components `PascalCase.tsx`, utilities `camelCase.ts`, tests `*.test.ts(x)`, E2E `*.spec.ts`.
- Preserve unrelated work. Do not commit generated `.next/`, `.open-next/`, `coverage/`, or `test-results/` output.
- Pre-push hook: `npm ci` installs it (`.githooks/pre-push`, enabled through `core.hooksPath` by the `prepare` script). It runs only the fast checks of `scripts/verify-local.mjs hook` on what the push sends (forbidden files such as `.env*` and keys, secrets, files over 10 MB, the `.gitignore` contract for env files), in about a second, and prints whether a proof exists for the pushed tree. It needs Node, not `node_modules`; it runs no test suite and accepts work in progress, any pushed branch and branch deletions. Agents never bypass it: no `git push --no-verify`, no change to `core.hooksPath`; fix the failure or report it.
- `npm run verify:pr` checks a commit (`HEAD` by default, `-- --rev <rev>` for another) on an isolated `git worktree` copy under the system temporary directory, so uncommitted work is neither checked nor touched. The copy links the checkout's `node_modules` when `package-lock.json` is the same (about a second); only the release `build` check reinstalls with `npm ci --prefer-offline` first (about 40-60 s and 1.4 GB, removed afterwards), because the Turbopack build refuses linked dependencies. Its checks are the former hook suite `npm run test:ci` split by inputs, the engine and hook tests, and `npm run lint:changed` (ESLint with `--max-warnings=0` on the JS/TS files changed since the merge base with `origin/main`; every file when `eslint.config.mjs` or `package-lock.json` changed). A check whose command, input files, Node, npm and lockfile already passed is reused, so a documentation-only change reruns no application check. The proof is `.git/verify-proofs/<tree>.json` (shared by worktrees, never committed); `node scripts/verify-local.mjs status` shows it. Run the other checks the change calls for as before.
- Commit only when authorized, using the existing style (`feat(scope):`, `fix:`, `refactor:`, `test:`, `chore:`) and ticket IDs when applicable.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Ignore routine debugging and unverified changes. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Keep a qualifying candidate through the reporting pass even if you resolve or work around it. A successful fix changes the report outcome; it does not erase the friction that qualified it.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `node node_modules/next/dist/bin/next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

agentFeedback is on. Never click Send on thanh's behalf. On the box, list review URLs in the final report; don't install a browser. Never disable telemetry to remove the block.

## E2E default and current contracts

- ClawDeals uses TesterArmy `e2e` with `@e2e-dev/web` for new and affected browser journeys. Read `node_modules/e2e/skills/e2e/SKILL.md` and the relevant topic once per installed version or changed API. Configuration is in `e2e.config.ts`; commands, targets and reports are in `docs/testerarmy-e2e.md`.
- Use `npm run test:testerarmy`, `npm run test:testerarmy:list` for discovery and `npm run testerarmy:mcp` for live exploration. Use one goal per `agent.act()` and exact assertions for critical outcomes, without model calls for exact steps. Compatible upgrades are allowed with relevant checks.
- Existing Playwright suites retain their runner. SDK/MCP/CLI changes should use real client/server or CLI journeys and preserve uncovered contract checks. Update obsolete assertions with the reason and a meaningful counterexample; do not require every historical replay.
- Keep private formative feedback and credentials out of exports; use only authorized providers and budgets. ClawDeals has no native target; native host tooling is covered in `docs/testerarmy-e2e.md#agent-device-routing`.
