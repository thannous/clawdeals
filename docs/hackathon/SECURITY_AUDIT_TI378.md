# TI-378 — WebMCP release security audit

Audit performed on 26 August 2026 for the ClawDeals WebMCP release candidate.

Required references:

- [Victory plan — repository](https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md)
- [Victory plan — Google Drive](https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk)

## Verdict

The local dependency tree is valid and both fresh npm audits report zero findings:

```json
{
  "npm_audit_full": { "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 },
  "npm_audit_omit_dev": { "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 }
}
```

This is **LOCAL** evidence only. CI, deployed-SHA verification, private-window smoke tests, real Chrome WebMCP, ChatGPT in-app, and public behavior have not yet been run for this dependency candidate.

The dependency remediation was prepared from base commit `07690a93c13749087b22962e6c4cc0ec95d5535f`. The candidate `package-lock.json` SHA-256 is:

```text
28c74b37c7dfccb680ae2ad4324e72f434d511d1117394c1761d5b9f303e5601
```

The lock hash must be refreshed in this document after the final commit if the lockfile changes again.

## Baseline snapshots

The initial raw reports were retained outside the repository during triage. They prove three distinct snapshots:

| Snapshot | Low | Moderate | High | Critical | Total entries |
|---|---:|---:|---:|---:|---:|
| Full A | 9 | 31 | 23 | 6 | 69 |
| Full B | 9 | 60 | 62 | 6 | 137 |
| `--omit=dev` | 2 | 9 | 14 | 2 | 27 |

The 69 and 137 values did **not** come from two denominators in one JSON file. They came from separate snapshots. The exact cause of their difference is **INDETERMINATE**, so they are neither added nor treated as equivalent. Release evidence uses two fresh audits against the same installed candidate tree.

## Remediation matrix

| Surface | Initial path and relevant advisories | Applicability | Candidate resolution | Result |
|---|---|---|---|---|
| Next.js | Direct `next@16.1.6`; Pages Router i18n middleware matched `GHSA-36qx-fr4f-26g5`. Other 16.x findings included `GHSA-q4gf-8mx6-v5v3`, `GHSA-26hh-7cqf-hhc6`, `GHSA-6gpp-xcg3-4w24`, `GHSA-p9j2-gv94-2wf4` and related image, RSC, cache, SSRF and DoS advisories. | **Applicable / INDETERMINATE by route.** The app uses Pages Router i18n and middleware. Some App Router and Server Action paths are not used by the judged flow. | `next`, `eslint-config-next`, and bundle analyzer aligned on `16.3.3`; direct PostCSS updated to `8.5.26`. | No npm finding. Build and middleware tests pass. |
| next-intl | Direct `next-intl@4.8.2`; `GHSA-8f24-v5vv-gm5j` and `GHSA-4c35-wcg5-mm9h`. | **Not proved exploitable.** ClawDeals uses custom middleware and does not enable message precompilation, but the vulnerable package shipped in the judged app. | `next-intl@4.9.2`. | No npm finding; i18n contracts pass. |
| Neon Auth / Better Auth | `@neondatabase/auth@0.4.2-beta` → `better-auth@1.4.18`. Findings included critical `GHSA-pw9m-5jxm-xr6h`, high `GHSA-qq9h-g4jm-xgf3`, `GHSA-9h47-pqcx-hjr4`, `GHSA-86j7-9j95-vpqj`, `GHSA-392p-2q2v-4372`, and related plugin/session findings. | **INDETERMINATE on production.** Supabase is the default browser backend, but `/api/auth` and the optional Neon backend are shipped. | `@neondatabase/auth@0.5.0-beta` → `better-auth@1.6.23`. Compatibility overrides pin `@better-auth/core@1.6.23` and the unused UI transitive `@daveyplate/better-auth-ui@3.3.9` to avoid an invalid peer tree in the published beta package. | No npm finding; `npm ls`, auth tests, typecheck and build pass. |
| MCP SDK / Hono | Direct latest `@modelcontextprotocol/sdk@1.30.0` → `hono@4.11.9` and `@hono/node-server@1.19.9`. Hono advisories ranged through `GHSA-8j4g-w8fx-2239`; node-server findings were `GHSA-wc8c-qw6v-h7f6`, `GHSA-92pp-h63x-v22m`, and `GHSA-frvp-7c67-39w9`. The SDK also resolved vulnerable AJV and Express transitives. | **Not proved on judged WebMCP.** Browser WebMCP calls Next APIs and remote MCP is disabled by default. The packages are still production dependencies for MCP surfaces. | SDK kept at `1.30.0`; overrides select `hono@4.12.34`, node-server `1.19.17`, and `ajv@8.18.0`. Compatible Express transitives were refreshed within declared ranges. | No npm finding; MCP tests pass. |
| Supabase / WebSocket | `@supabase/supabase-js@2.94.1` → Realtime → `ws@8.19.0`; `GHSA-58qx-3vcg-4xpx` and `GHSA-96hv-2xvq-fx4p`. | **INDETERMINATE.** Supabase is used by judged APIs, but first-party code does not open Realtime channels. | `@supabase/supabase-js@2.112.4`, whose Realtime package no longer installs `ws`. | No npm finding; Supabase/auth tests and build pass. |
| OpenNext / Cloudflare | Dev/build fallback `@opennextjs/cloudflare@1.16.2`; `GHSA-c7mq-gh6q-6q7c`. | **Not on the primary judged deployment path.** Vercel serves the app and Wrangler deploys the edge router, but the fallback remained installable. | `@opennextjs/cloudflare@1.17.1`; resolved `wrangler@4.126.0`. | No npm finding; Wrangler dry-run passes. |
| Vitest / test server | Direct `vitest@2.1.9` and coverage package; critical `GHSA-5xrq-8626-4rwp`. | **Dev-only and not publicly exposed**, but direct and critical. | Vitest and V8 coverage `4.1.11`; config migrated from removed `environmentMatchGlobs` to projects. Constructor mock adapted to Vitest 4 semantics. | No npm finding; 373 files pass, 2616 tests pass, one skip. |
| API tooling | Redocly, OpenTelemetry, DOMPurify, protobuf, Handlebars, XML parser and related dev-only chains. | **Dev/build only.** They are not shipped as app runtime code, but were retained in the full audit. | Compatible lockfile refresh, including `@redocly/cli@2.48.0`. | Full audit is zero; OpenAPI lint passes with existing warnings only. |

## Candidate dependency proof

Important resolved versions:

```text
next@16.3.3
next-intl@4.9.2
@neondatabase/auth@0.5.0-beta
better-auth@1.6.23
@supabase/supabase-js@2.112.4
@modelcontextprotocol/sdk@1.30.0
hono@4.12.34
@hono/node-server@1.19.17
ajv@8.18.0
@opennextjs/cloudflare@1.17.1
wrangler@4.126.0
vitest@4.1.11
@vitest/coverage-v8@4.1.11
```

No `npm audit fix`, `npm audit fix --force`, or unreviewed major fixer was used. Each direct or transitive update was selected explicitly and validated against the application.

## Local validation

| Check | Result |
|---|---|
| Node / npm | `v24.19.0` / `11.17.0` |
| `npm ls --depth=0` and scoped dependency tree | PASS |
| `npm audit --json` | PASS — 0 findings |
| `npm audit --omit=dev --json` | PASS — 0 findings |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS — 373 files, 2616 passed, 1 skipped |
| `npm run test:coverage` | PASS — 373 files, 2616 passed, 1 skipped |
| i18n contract and messages | PASS |
| OpenAPI lint | PASS — existing warnings, no error |
| `npm run build` | PASS — Next 16.3.3, 109 generated Pages routes plus App routes |
| Wrangler deploy dry-run | PASS — edge router bundle generated, no deployment |

## Remaining release gates

- Fresh clone and `npm ci` against the committed lockfile.
- Local database reset, migrations, deterministic sandbox seed, and full `release:hackathon:local` gate.
- Remote CI on the exact candidate SHA.
- Push and deployed-SHA verification.
- Private-window, real Chrome WebMCP, ChatGPT in-app, and public smoke evidence.
- Video and Devpost submission.

Until those layers pass, TI-378, TI-376, and TI-375 remain in progress.
