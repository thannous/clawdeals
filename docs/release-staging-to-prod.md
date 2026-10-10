# Release procedure — direct main deployment

Updated 2026-09-28. This filename is retained for existing links; the former staging-promotion workflow is retired. Current environment policy: [release-environments.md](./release-environments.md).

1. Review the requested diff and preserve unrelated work. Run checks relevant to the changed behavior; documentation-only edits do not require an application build or browser suite.
2. When commit/push is authorized, commit the intended files on a branch and push it (the `pre-push` hook runs its fast checks), run `npm run verify:pr`, open a PR from `.github/pull_request_template.md`, and have it merged into `main` once review comments are addressed; a direct push to `main` remains possible for a small reviewed change (`AGENTS.md`). Automatic Git deployment from `main` is disabled in `vercel.json`: publish that exact commit to `clawdeals` once it passes the [validation gate](./hosting-cloudflare-vercel.md#current-development-topology-2026-09-28): `npm run verify:release` on that SHA, historical browser corpus included. No staging branch, separate staging project or repeated deployment approval is required for that authorized push.
3. Verify the deployment associated with the pushed SHA is ready and inspect the affected public behavior. A successful Git push or CI run alone is not deployment proof.
4. Apply database migrations only when the requested work includes them. Review migration order and compatibility; a Vercel deploy does not apply SQL migrations. Disposable data does not make schema damage harmless.
5. Deploy the Cloudflare Worker only when its code/configuration changed and that deployment is authorized. `npm run deploy:cloudflare` is not a routine step for a Vercel-only app change.
6. Report commit, deployment status, relevant verification and unresolved limitations.

Production currently contains owner-confirmed fictitious test data. Relevant test writes are authorized under `AGENTS.md`; the shared test tooling still has production-target guards described in the environment policy. Existing sandbox reset endpoints are not production reset endpoints.

## Recovery

For an app regression, select a known-good deployment or prepare a focused revert under the authorized task scope. Check database compatibility first. A Vercel rollback does not undo migrations, data writes or Cloudflare changes. Infrastructure deletion and database restore require their own explicit scope.

## Separate release channels

- App: Vercel project `clawdeals`, published from `main` after the validation gate.
- Edge router/scheduler: manual Cloudflare deployment when needed.
- MCP npm package: manual dispatch of `.github/workflows/mcp-release.yml` with a `version` input; see [MCP release](./mcp-release.md).
- SDK packages: manual dispatch of `.github/workflows/sdk-release.yml` with `target` (`ts` or `py`) and `version` inputs.

A push to `main` does not publish these packages automatically.
