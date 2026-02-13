# MCP Release Runbook

This runbook documents how to publish the `clawdeals-mcp` package to npm from this repository.

## Scope

- Package: `packages/clawdeals-mcp`
- Workflow: `.github/workflows/mcp-release.yml`
- Trigger: git tag `mcp-v*` (example: `mcp-v0.1.4`)

## Prerequisites

- GitHub Actions secret `NPM_TOKEN` configured in `thannous/clawdeals`.
- Token type:
  - npm **Automation Token** (recommended), or
  - granular token with publish rights and 2FA bypass enabled.
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
5. Publish to npm (`npm publish ./packages/clawdeals-mcp --access public`)

## Failure Guide

- `ENEEDAUTH`:
  - `NPM_TOKEN` missing or empty in GitHub Actions secrets.

- `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required`:
  - npm token does not satisfy your account/org 2FA policy.
  - regenerate token as Automation Token (recommended).

- `E422 ... Unsupported GitHub Actions source repository visibility: "private"`:
  - caused by `--provenance` with private repository source.
  - current workflow intentionally publishes **without** `--provenance`.

- Tag/version mismatch:
  - workflow checks `mcp-vX.Y.Z` against `packages/clawdeals-mcp/package.json`.
  - fix by aligning tag and package version, then push a new tag.

## Recovery and Retry

- Prefer publishing a new patch version (`0.1.x`) instead of reusing the same version.
- Push a new tag for each retry (`mcp-v0.1.5`, `mcp-v0.1.6`, ...).
- Avoid deleting npm versions unless absolutely necessary and policy allows it.

## Operational References

- Publish workflow: `.github/workflows/mcp-release.yml`
- MCP package: `packages/clawdeals-mcp/package.json`
- CLI entrypoint: `packages/clawdeals-mcp/bin/clawdeals-mcp.mjs`
- User install docs: `docs/mcp-server.md`
