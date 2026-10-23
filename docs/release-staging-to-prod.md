# Release procedure — reviewed PR and approved production release

Updated 2026-10-11. This filename is retained for existing links; the former staging-promotion workflow is retired. Current environment policy: [release-environments.md](./release-environments.md).

1. Review the requested diff and preserve unrelated work. Run checks relevant to the changed behavior; documentation-only edits do not require an application build or browser suite.
2. The owner's standing authorization (2026-10-11) covers the commits needed for requested ClawDeals work, pushing its work branch and opening or updating its PR without another confirmation. Commit the intended files on a branch, run `npm run verify:pr` and push only if it passes. Keep the fast `pre-push` hook enabled. Open a PR from `.github/pull_request_template.md`, stating the checked commit and result; the CTO reviews and merges once comments are addressed and nothing blocks.
3. Run `npm run verify:release` on the exact merged `main` SHA before publication, including the historical browser corpus; see the [validation gate](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28). Automatic Git deployments are disabled for every branch in `vercel.json`. Publish that SHA to `clawdeals` only on thanh's go. No staging branch or separate staging project is needed.
4. Verify the deployment associated with the published SHA is ready and inspect the affected public behavior. A successful Git push, merge or CI run alone is not deployment proof.
5. Apply database migrations only when the requested work includes them. Review migration order and compatibility; a Vercel deploy does not apply SQL migrations. Disposable data does not make schema damage harmless.
6. Deploy the Cloudflare Worker only when its code/configuration changed and that deployment is authorized. `npm run deploy:cloudflare` is not a routine step for a Vercel-only app change.
7. Report the checked and merged commits, PR/review status, deployment status, relevant verification and unresolved limitations.

Production contains owner-confirmed fictitious test data during this development phase. Relevant test writes are authorized under `AGENTS.md`; supported test commands use the explicit ClawDeals-only opt-in described in the environment policy. Existing sandbox reset endpoints are not production reset endpoints.

## Verification configuration

The verification engine reads `verify-local.config.json` as data from the selected
commit. Legacy `verify-local.config.mjs` files are never imported. Historical
commits without JSON retain the default fast push checks; explicit verification
and proof rendering require the JSON configuration. Invalid JSON or unsupported
hook operations block a push instead of silently omitting checks.

`hook.checks` accepts only the built-in name `gitignore-env`, which checks that
`.env` and `.env.local` are ignored and `.env.example` is not. It runs fixed Git
arguments without a shell and, as before, skips this checkout check when pushing
another commit. Forbidden-file, size and secret checks still inspect pushed blobs.
Commands in `checks`, dependency installation and probes remain intentional code
execution during explicit `verify:pr` and `verify:release`; their isolated copies
protect working files, not host privileges. Run those modes only on trusted code.

When changing the engine, update the JSON `ENGINE_SHA256` field to the SHA-256 of
the LF bytes of `scripts/verify-local.mjs`. Keep the JSON check inputs and exclusions
in sync with renamed tooling. The `lint-changed` scope mirrors
`scripts/lint-everything.mjs`; its contract tests enforce both lists. Release-only
checks remain uncached; browser evidence, external-source restrictions and the
owner's publication approval remain governed by the procedure above.

## Recovery

For an app regression, select a known-good deployment or prepare a focused revert under the authorized task scope. Check database compatibility first. A Vercel rollback does not undo migrations, data writes or Cloudflare changes. Infrastructure deletion and database restore require their own explicit scope.

## Separate release channels

- App: Vercel project `clawdeals`, published from the exact merged `main` SHA after the release gate and thanh's go.
- Edge router/scheduler: manual Cloudflare deployment when needed.
- MCP npm package: manual dispatch of `.github/workflows/mcp-release.yml` with a `version` input; see [MCP release](./mcp-release.md).
- SDK packages: manual dispatch of `.github/workflows/sdk-release.yml` with `target` (`ts` or `py`) and `version` inputs.

A push to `main` does not publish these packages automatically.
