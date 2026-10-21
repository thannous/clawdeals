# Dependency maintenance — 21 October 2026

This update starts from `origin/main` at `cb6486f` and keeps the existing
Node 24.19.0 runtime, providers, and deployment configuration.

| Dependency | Previous lockfile | Updated lockfile |
| --- | --- | --- |
| `@types/node` | 25.9.9 | 24.19.2 |
| `@ai-sdk/openai` | 4.0.96 | 4.0.99 |
| `@ai-sdk/openai-compatible` | 3.0.71 | 3.0.75 |
| `ai` | 7.0.143 | 7.0.148 |
| `@opennextjs/cloudflare` | 1.20.12 | 1.20.13 |
| `@redocly/cli` | 2.64.1 | 2.67.1 |
| `postcss` | 8.5.30 | 8.5.31 |
| `wrangler` | 4.151.1 | 4.151.3 |

The highest-priority maintenance correction is aligning `@types/node` with
the supported Node 24 runtime. The previous Node 25 declarations could allow
code that does not run on the pinned production runtime. The AI SDK and
tooling updates stay within their existing major versions. The lockfile also
refreshes their compatible transitive packages.

The newer Redocly CLI flags a one-member `allOf` in `ListingPhotoV1`; the
schema now references `MediaImageV1` directly. The referenced schema and
listing fields are unchanged.

The current npm audit reports zero vulnerabilities. The local `braces` depth
guard remains necessary because upstream `braces` has no fixed release for
the recursion issue; its override and regression coverage remain in place.
Major upgrades, the Neon Auth beta jump, and the separately documented
Next ESLint/React Hooks migration are outside this compatible update.

Local checks on the updated tree: `npm ci` and `npm audit` found zero
vulnerabilities; typecheck, full lint, OpenAPI lint, and 919 unit tests
passed (one existing skip). Regenerating both SDKs produced no tracked
changes. The Next.js production build and OpenNext Cloudflare fallback
build passed. TesterArmy ran the synthetic catalogue journey on desktop
and mobile: eight selected cases passed with no skips or retries. The
ignored report is `.e2e/validation/maintenance-20261021-catalog`.

This is local/PR maintenance only. It does not authorize a production
deployment or a Cloudflare release.
