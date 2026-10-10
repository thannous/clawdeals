# MCP Release Runbook

This runbook documents how to publish the `clawdeals-mcp` package to npm from this repository.

## Scope

- Package: `packages/clawdeals-mcp`
- Workflow: `.github/workflows/mcp-release.yml`
- Trigger: manual dispatch on `main` with a `version` input (example: `0.1.4`)

## Prerequisites

- npm trusted publisher configured for `clawdeals-mcp`:
  - provider: GitHub Actions
  - organization or user: `thannous`
  - repository: `clawdeals`
  - workflow filename: `mcp-release.yml`
  - environment: `release` (the job now runs in that GitHub environment; an empty npm environment field is not checked, setting `release` binds publishing to it)
  - allowed action: `npm publish`
- The workflow must keep `id-token: write`, use a GitHub-hosted runner, Node 24,
  npm 11.5.1 or newer, and publish without `NODE_AUTH_TOKEN`.
- GitHub environment `release` limited to `main` (deployment branch policy `main` only), holding the publish secrets.
- Gating, as enforced: the job-level `if: github.ref == 'refs/heads/main'` skips any other ref before a runner starts, and the `release` environment refuses any branch but `main`. A dispatch runs the workflow file of its own ref, so the `if` alone can be edited away on a branch; the real enforcement is the environment branch policy.
- You work on a branch from an up-to-date `main`, with a clean release diff for MCP files.

## Release Procedure

Publication requires thanh's go; these instructions are not permission to publish. Check that the selected version is unused.

1. Bump package version in `packages/clawdeals-mcp/package.json`.
2. Keep CLI version output in sync in `packages/clawdeals-mcp/bin/clawdeals-mcp.mjs`.
3. Validate locally:

```bash
node packages/clawdeals-mcp/bin/clawdeals-mcp.mjs --version
npm pack ./packages/clawdeals-mcp --dry-run
```

4. Merge the change into `main` through a PR.
5. Dispatch the release workflow on `main`:

```bash
MCP_RELEASE_VERSION="$(node -p 'require("./packages/clawdeals-mcp/package.json").version')"
gh workflow run mcp-release.yml --repo thannous/clawdeals --ref main -f version="${MCP_RELEASE_VERSION}"
```

6. Watch the workflow:

```bash
gh run list --repo thannous/clawdeals --workflow "MCP Release" --limit 5
gh run watch <run_id> --repo thannous/clawdeals
```

7. Verify publication:

```bash
npm view clawdeals-mcp version --json
```

## Expected Workflow Steps

1. Install root dependencies (`npm ci`)
2. Verify the `version` input equals the package version (the `main` restriction is the job-level `if` and the `release` environment, before any step runs)
3. Validate CLI entrypoint (`--help`)
4. Validate publish artifact (`npm pack --dry-run`)
5. Exchange the GitHub Actions OIDC identity for a short-lived npm credential.
6. Publish to npm (`npm publish ./packages/clawdeals-mcp --access public`)

## Failure Guide

- `ENEEDAUTH` or `E404` during `npm publish`:
  - verify the trusted publisher fields on npmjs.com;
  - fields are case-sensitive and the workflow must be exactly `mcp-release.yml`;
  - keep `id-token: write`, Node 24, npm 11.5.1 or newer, and no
    `NODE_AUTH_TOKEN`.

- `E422 ... Unsupported GitHub Actions source repository visibility: "private"`:
  - provenance is unsupported for this private source repository.
  - keep `publishConfig.provenance` and `NPM_CONFIG_PROVENANCE` set to `false`.

- Version mismatch:
  - workflow checks the `version` input against `packages/clawdeals-mcp/package.json`.
  - fix by aligning the input and the package version, then dispatch again.

## Recovery and Retry

- Prefer publishing a new patch version (`0.1.x`) instead of reusing the same version.
- Dispatch with the new version for each retry (`0.1.5`, `0.1.6`, ...).
- Avoid deleting npm versions unless absolutely necessary and policy allows it.
- Do not restore a long-lived npm write token after trusted publishing is active.

## Operational References

- Publish workflow: `.github/workflows/mcp-release.yml`
- MCP package: `packages/clawdeals-mcp/package.json`
- CLI entrypoint: `packages/clawdeals-mcp/bin/clawdeals-mcp.mjs`
- User install docs: `docs/mcp-server.md`
