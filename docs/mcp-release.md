# MCP Release Runbook

This runbook documents how to publish the `clawdeals-mcp` package to npm from this repository.

## Scope

- Package: `packages/clawdeals-mcp`
- Workflow: `.github/workflows/mcp-release.yml`
- Trigger: git tag `mcp-v*` (example: `mcp-v0.1.4`)

## Prerequisites

- npm trusted publisher configured for `clawdeals-mcp`:
  - provider: GitHub Actions
  - organization or user: `thannous`
  - repository: `clawdeals`
  - workflow filename: `mcp-release.yml`
  - environment: none
  - allowed action: `npm publish`
- The workflow must keep `id-token: write`, use a GitHub-hosted runner, Node 24,
  npm 11.5.1 or newer, and publish without `NODE_AUTH_TOKEN`.
- You are on `main` with a clean release diff for MCP files.

## Release Procedure

1. Bump package version in `packages/clawdeals-mcp/package.json`.
2. Keep CLI version output in sync in `packages/clawdeals-mcp/bin/clawdeals-mcp.mjs`.
3. Validate locally:

```bash
node packages/clawdeals-mcp/bin/clawdeals-mcp.mjs --version
npm pack ./packages/clawdeals-mcp --dry-run
```

4. Commit and push to `main`.
5. Create and push the release tag:

```bash
git tag mcp-v0.1.4
git push origin mcp-v0.1.4
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
2. Verify tag version equals package version
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

- Tag/version mismatch:
  - workflow checks `mcp-vX.Y.Z` against `packages/clawdeals-mcp/package.json`.
  - fix by aligning tag and package version, then push a new tag.

## Recovery and Retry

- Prefer publishing a new patch version (`0.1.x`) instead of reusing the same version.
- Push a new tag for each retry (`mcp-v0.1.5`, `mcp-v0.1.6`, ...).
- Avoid deleting npm versions unless absolutely necessary and policy allows it.
- Do not restore a long-lived npm write token after trusted publishing is active.

## Operational References

- Publish workflow: `.github/workflows/mcp-release.yml`
- MCP package: `packages/clawdeals-mcp/package.json`
- CLI entrypoint: `packages/clawdeals-mcp/bin/clawdeals-mcp.mjs`
- User install docs: `docs/mcp-server.md`
