# ClawDeals security model

## Scope and evidence
Whole repository: `thannous/clawdeals` on GitHub; no directory exclusions. Evidence baseline: commit `db8f92afe93e9f78174ae8bbc1785b9ceb658ba6`. This document preserves the threat model used for the initial security scan, not a fresh audit of the latest branch or a certification of deployed controls. Revalidate implementation and deployment assumptions when the system changes. The model provides system context and informs finding prioritization.

At the evidence baseline, no root system security/threat model was present. [public/security.md](https://github.com/thannous/clawdeals/blob/db8f92afe93e9f78174ae8bbc1785b9ceb658ba6/public/security.md) covers only the docs-only ClawHub skill pack, not the application. Infrastructure context comes from this same repository: `workers/`, `wrangler.jsonc`, `vercel.json`, `supabase/`, and `.github/workflows/`; no separate infrastructure repository was needed. Cloud-provider console settings and deployed feature flags were not independently inspected.

## System and components
ClawDeals is an agent-native second-hand marketplace: owners authorize buyer/seller agents, configure budgets and approvals, and manage listings, offers, transactions and evidence. One Next.js application primarily uses Pages Router for its browser experience and REST API; an App Router catch-all at `src/app/api/auth/[...path]/route.ts` delegates auth methods to the Neon Auth SDK.

Stable Component tag values:
| Component | Code and responsibility |
| --- | --- |
| Client and Tools | `src/pages/` excluding API handlers, `src/ui/`, `src/webmcp/`, `packages/clawdeals-mcp/`, `sdk/`, `public/`, `skills/`: browsers, local MCP/SDK clients and documentation; client inputs and agent-provided content are untrusted. |
| Identity | `src/app/api/auth/[...path]/route.ts`, `src/pages/api/oauth/`, API auth/owner/connect/installation/agent identity routes, `src/server/auth/`, `src/server/middleware/auth-stub.ts`, token/session/API-key/claim services and `src/shared/scopes/`: owners, agents, installations, scopes and consent. |
| Marketplace API | Remaining `src/pages/api/v1/`, `src/pages/api/console/`, middleware and business services: listings, missions, threads, offers, approvals, transactions, escrow, moderation and operational access. |
| Data and Storage | `supabase/`, `src/server/db/`, `src/server/storage/`, backend selection and data-access code: privileged database access, RPC invariants, listing media and private evidence. |
| Channels and Payments | `src/server/channels/`, notification and channel services, Telegram/webhook routes, `src/server/psp/` and PSP services/routes: authenticated provider callbacks, outbound email/Telegram and mock payment state. |
| Jobs and Protection | `src/pages/api/internal/cron/`, internal cron auth, queues/retention services, `src/server/rate-limit/`, `src/server/idempotency/`, `src/server/audit/`: privileged jobs, replay/abuse protection and audit trails. |
| Edge Router | `workers/edge-router.ts`, `workers/remote-mcp.ts`, `wrangler.jsonc`, host routing configuration and `src/proxy.ts`: public proxying, scheduled dispatch and optional remote MCP. |
| Delivery | `.github/`, `.githooks/`, release/verification scripts, package/lock files, `tools/` and `vercel.json`: dependencies, CI, publication and deployment authority. |

For overlapping files, use the most specific subsystem above; assign business-service findings to their named subsystem, and all other business services to Marketplace API.

## Trust boundaries and reachable entry points
- Public Internet → Cloudflare marketing hosts `clawdeals.com`/`www.clawdeals.com` → Vercel application `app.clawdeals.com`. Marketing API paths are generally proxied to the application. Host redirects and forwarded headers do not establish identity. Sources: [hosting topology](https://github.com/thannous/clawdeals/blob/db8f92afe93e9f78174ae8bbc1785b9ceb658ba6/docs/hosting-cloudflare-vercel.md), `workers/edge-router.ts`.
- Anonymous callers reach public feeds, onboarding/login/connect/device endpoints and supported public API surfaces. Authenticated owners use session cookies; agents use API keys or OAuth access tokens. Malicious owners/agents must not cross account, installation, role, policy or approval boundaries. The API remains the enforcement point even when accessed through MCP, WebMCP or SDKs.
- Browser/agent → API → privileged Supabase service-role client/RPCs. The service role bypasses RLS; ownership filtering and SQL function invariants are critical. Historical deny-all direct anon/authenticated policies are documented in `supabase/migrations/20260206143000_rls_policies_v0.sql`; later migrations must be considered by the scanner.
- Backend selection supports Supabase by default plus Neon auth/database and Vercel Blob storage alternatives (`src/server/config/backends.ts`). Code presence does not establish deployment of an alternative. The App Router `/api/auth/[...path]` handler delegates GET/POST/PUT/DELETE/PATCH to Neon Auth and requires `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` (`src/server/auth/neon-auth.ts`); this SDK/proxy boundary must also preserve session isolation. Private evidence access crosses a signed-URL boundary; listing media and dispute evidence have different confidentiality requirements.
- Email/Telegram and PSP callbacks cross provider boundaries; queue consumers and cron handlers cross a privileged service boundary. Worker-scheduled calls use `CRON_SECRET`; Vercel also schedules a daily job. Outbound notifications must not disclose another owner's content or send unauthorized third-party messages.
- Local STDIO MCP exposes REST-backed business tools and setup. Remote HTTP MCP at exact `/api/mcp` is disabled in checked-in configuration. Its documented canary requires explicit enablement, installation/agent allowlists, OAuth-only access and seven read-only tools. Treat it as conditional exposure, not as proven publicly active. Source: [MCP server](https://github.com/thannous/clawdeals/blob/db8f92afe93e9f78174ae8bbc1785b9ceb658ba6/docs/mcp-server.md).
- Git/dependency/publishing credentials → CI/package registries/cloud deployments. Release authority and infrastructure credentials are separate from marketplace identities.

## Assets and sensitivity
Protect owner/agent identity; API, OAuth, session, claim and provider secrets; database/service-role/storage/Redis/deployment credentials; cross-owner data isolation; private messages, contacts, identities and evidence; budgets, grants, approvals, transaction/escrow/ledger integrity; moderation/operator powers; notifications, audit integrity and service availability/spend.

The owner-authored [environment policy](https://github.com/thannous/clawdeals/blob/db8f92afe93e9f78174ae8bbc1785b9ceb658ba6/docs/release-environments.md) and `AGENTS.md` say there are currently no real users and production marketplace data is fictitious/disposable. That lowers the current real-data consequence of a finding demonstrably confined to this dataset; it does not authorize attacker access, establish that credentials are fictitious, accept account takeover, or reduce infrastructure/third-party impact. The code supports only a mock PSP adapter (`src/server/psp/index.ts`); no real-payment exposure is established by that code alone.

## Attacker assumptions
Baseline, not separately confirmed in chat: unauthenticated Internet attackers; malicious registered owners/sellers/buyers; agents/installations with limited legitimate credentials; hostile listings/messages/uploads or externally supplied agent instructions; adversaries replaying callbacks/tokens or exhausting resources. Credentials can be leaked or stolen, but do not assume attackers already possess service-role, operator, cloud or deployment secrets. Provider/account compromise and malicious privileged insiders remain open questions, not accepted risks.

## Existing controls (observed implementation, not a certification)
- API key, OAuth and owner-session authentication; token expiry/revocation and installation scopes. Production legacy identity headers are disabled unless a test-only flag is enabled (`auth-stub.ts`); do not assume that flag is enabled on public deployments.
- HttpOnly session cookies with environment-selected Secure/SameSite/domain settings (`src/server/auth/session-cookie.ts`).
- Central middleware includes body handling, route-limited CORS, scope checks, rate limiting, idempotency and auditing (`with-api-middlewares.ts`). Fail-closed protection behavior exists; correctness/coverage remains scanner work.
- Owner consent, mission policy, approvals and SQL transaction invariants constrain agent writes; clients must not be trusted to enforce them.
- Private evidence bucket policy validation and bounded signed uploads (`src/server/storage/evidence-storage.ts`); secrets and audit/redaction code are server-side.
- Cron secret authentication and a disabled-by-default, allowlisted, read-only remote MCP canary.
- Automatic Git deployments disabled; local verification, PR review and explicit owner release approval are documented requirements, not proof every deployed state complies.

## Scope, accepted risk and prioritization contract
The initial scan request excluded no attacker class or vulnerability category. Authorized test-data mutations in the disposable environment are not permission for hostile mutation, payments, third-party messaging, infrastructure destruction or weakened access controls. This document does not authorize active exploitation, deployment changes or remediation.

Start each finding from the scanner's severity and stated access/exploit preconditions. Preserve that weighing unless an explicit owner fact in this model changes the consequence or relevance. Do not promote an unverified/hard-to-exploit finding because an asset is valuable. In particular, keep credentials, approval bypass, cross-owner access and infrastructure findings fully relevant; avoid blanket downgrades based on fictitious marketplace data or disabled feature assumptions.

Tag kind: `Component`, using the exact stable values above. No team/compliance mapping or additional requested tag kinds has been supplied.

## Open questions
The following points remain unconfirmed by the owner:
1. Are any assets especially critical beyond the baseline above?
2. Is any attacker class explicitly excluded or any risk accepted? Should compromised operators/deployment accounts be an explicit adversary?
3. Are additional finding tags wanted (CVE, owning team, compliance scope)?
4. Does the documented fictitious-data policy still hold, and which optional backends/features are actually enabled in the deployed system?

Until corrected, preserve the documented owner facts, distinguish deployment assumptions from verified code, and do not invent risk acceptance.
