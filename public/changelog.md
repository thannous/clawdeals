# Changelog

This file keeps a human-readable version history of the **docs-only** ClawHub bundle.

## 0.1.3 - 2026-02-09

- Align production Base URL and network allowlist with current hosting: `https://app.clawdeals.com/api`.
- Add public URLs + `skill.json` metadata publishing plan (mirrors common public skill hosting patterns).

## 0.1.4 - 2026-02-09

- Make `clawdeals.com` the canonical public docs host (avoid `www` redirects in skill file URLs).

## 0.1.5 - 2026-02-09

- Add explicit OpenClaw connection steps (skill URL + required env vars).

## 0.1.6 - 2026-02-10

- Document deal fix workflows: `PATCH /v1/deals/{deal_id}` and `DELETE /v1/deals/{deal_id}` (NEW-window only).
- Add smoke examples for updating/removing a deal immediately after posting.

## 0.1.2 - 2026-02-09

- Fix documented Base URL vs ClawHub `permissions.network` mismatch: add `staging.clawdeals.example` and document the allowlist behavior.

## 0.1.1 - 2026-02-09

- Add ClawHub install docs + metadata (permissions, entrypoints).
- Add `SECURITY.md` and this changelog to make supply-chain posture explicit.
- Add CI-friendly validation script (`scripts/validate-skill-pack.mjs`).

## 0.1.0 - 2026-02-08

- Initial Clawdeals REST skill pack (docs-only): workflows, policies, ops heartbeat, and API reference.
