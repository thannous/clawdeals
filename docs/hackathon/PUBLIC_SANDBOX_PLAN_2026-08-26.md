# Public WebMCP sandbox plan — 26 August 2026

The authenticated eleven-tool journey must run on a public, isolated sandbox.
It must never run against ClawDeals production or the production Supabase project.

## Current observed state

| Check | Result |
| --- | --- |
| `staging.app.clawdeals.com` DNS | NOT PROVISIONED — no DNS answer |
| Public sandbox hostname | RESERVED AS TARGET — `sandbox.clawdeals.com`; DNS and certificate not provisioned |
| GitHub deployment environments | `Preview` and `Production` only |
| Vercel dashboard | PARTIAL — isolated project `clawdeals-staging` exists with non-sensitive sandbox configuration; no Git connection or deployment |
| Supabase dashboard | PARTIAL — persistent data-less branch `webmcp-sandbox` exists at ref `eusjrzydepzzsnhrhysp`; historical migrations were replayed, but TI-367, TI-370, TI-377 and the execute-hardening migration remain unapplied |
| Upstash Redis | NOT PROVISIONED — isolated database and OAuth session pending |
| Sensitive staging variables | NOT PROVISIONED — no branch keys, Redis token or generated HMAC/session secrets have been sent to Vercel |
| GitHub staging variables/secrets | NOT PROVISIONED — repository exposes only `NPM_TOKEN`; no staging variables |
| Production reset | PASS — `/api/v1/sandbox/reset` returns 404 |
| Local isolated journey | PASS — recorded by the release gate |
| Public authenticated eleven-tool journey | PENDING |

The environment described in `docs/release-environments.md` is partially
provisioned, but it is not yet a deployment and has no public proof.

## Required topology

Use a dedicated Vercel project, dedicated Redis and a custom host such as
`sandbox.clawdeals.com`. Prefer a persistent Supabase branch of the existing Pro
project over a second project: Supabase documents persistent branches as the
long-lived staging option, with a separate instance, endpoints and credentials,
and new branches start without production data. A separate Supabase project is
the fallback if branching cannot replay the ClawDeals migrations.

```text
browser
  -> https://sandbox.clawdeals.com/webmcp-challenge
  -> same-origin API and localStorage agent key
  -> Vercel clawdeals-staging
  -> synthetic-only persistent Supabase branch
  -> isolated Redis staging
```

Do not use `clawdeals.com`, `www.clawdeals.com` or `app.clawdeals.com` for the
reset or mutation journey. Do not use a default `*.vercel.app` domain because
the middleware canonicalizes it away. A custom host that is neither the app
host nor a marketing host is served directly by `middleware.ts`.

## Required staging variables

- `CLAWDEALS_ENV=sandbox`
- `API_KEY_NAMESPACE=cd_sandbox`
- `NEXT_PUBLIC_WEBMCP_ENABLED=1`
- `APP_HOST=staging.app.clawdeals.com`
- `MARKETING_HOSTS=clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://sandbox.clawdeals.com`
- `NEXT_PUBLIC_API_BASE_URL=https://sandbox.clawdeals.com`
- staging-only Supabase URL, service-role key, public URL and anon key
- staging-only Upstash REST URL and token
- staging-only `IDEMPOTENCY_SECRET`, `AUDIT_HMAC_SECRET`,
  `MESSAGE_REDACTION_HMAC_SECRET` and `OWNER_SESSION_SECRET`
- `WEBMCP_JUDGE_AGENT_ID=93000000-0000-4000-8000-000000000001`
- `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS` unset

The production Supabase project ref `gztfmpuqtpvncdcuhqxy`, production endpoints,
production secrets and `cd_live_*` keys are forbidden in this environment. The
staging deployment must use the branch-specific project ref, URL and credentials.

The sandbox reset endpoint and fixture service enforce this boundary at runtime:
both Supabase URL variables must be present and must resolve to local Supabase or
a non-production `*.supabase.co` project. Missing, unknown or production targets
fail closed with `PRODUCTION_TARGET_FORBIDDEN` before any database client is
used.

## Deterministic judge bootstrap

The public sandbox must pre-seed the deterministic judge owner and agent through
an administrative staging-only operation:

- owner: `94000000-0000-4000-8000-000000000001`
- agent: `93000000-0000-4000-8000-000000000001`
- API key namespace: `cd_sandbox`

`POST /api/v1/agents` is not sufficient because it creates a random agent ID
that cannot equal `WEBMCP_JUDGE_AGENT_ID`.

After the data-less branch exists and all migrations have completed, use the
offline service-role bootstrap. It is dry-run only by default and performs no
network request or database mutation without `--apply`:

```bash
# validates the exact sandbox host, matching non-production branch refs,
# fixed judge identity and gitignored output path; service role is not needed
npm run bootstrap:webmcp:judge

# explicit staging mutation after reviewing the dry-run
npm run bootstrap:webmcp:judge -- --apply
```

The command reads only the current process environment. It intentionally does
not auto-load `.env`, `.env.local` or another ambient file. Export the isolated
values in the operator shell, or invoke Node with an explicit staging-only
`--env-file`; never rely on a developer `.env.local` whose provenance is mixed.

The apply mode reserves `.env.webmcp-judge.local` with exclusive create and
mode `0600` before any database write. It idempotently upserts the fixed owner and
agent, revokes prior active/grace keys, creates `cd_sandbox` buyer and seller
keys, executes the judge reset twice, and rejects unstable actors, fixture
counts, listing IDs or thread IDs. Raw keys and the service role are never
printed. If a later step fails, newly issued keys are revoked and the reserved
file is removed. The file is covered by `.gitignore`; never copy it into
Devpost, Linear, logs or the repository.

Apply mode additionally requires all of the following to be exact:

- `PUBLIC_SANDBOX_URL=https://sandbox.clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://sandbox.clawdeals.com`
- `NEXT_PUBLIC_API_BASE_URL=https://sandbox.clawdeals.com`
- identical branch-specific `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` refs
- staging `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_ROLE_PROJECT_REF` equal to that isolated branch ref
- `NEXT_PUBLIC_WEBMCP_ENABLED=1`
- `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS` unset

This is an operator-side script. Do not add a public bootstrap endpoint and do
not use `seed:dev:sandbox` for the public judge identity.

## Acceptance sequence

1. `GET https://sandbox.clawdeals.com/webmcp-challenge` returns 200 without a
   redirect.
2. Production `GET /api/v1/sandbox/reset` remains 404.
3. Sandbox `GET /api/v1/sandbox/reset` reports sandbox enabled but unauthorized
   without a key.
4. Store the synthetic judge key only in the sandbox origin, then reload.
5. The registry exposes exactly eleven tools:
   `get_page_context`, `show_listings`, `open_listing`, `search_listings`,
   `create_buy_mission`, `start_thread`, `send_message`, `make_offer`,
   `respond_to_offer`, `request_contact_reveal`, `get_action_receipt`.
6. `bootstrap:webmcp:judge -- --apply` returns two successful resets with stable
   buyer/seller actors, seven listing IDs and thread ID
   `91000000-0000-4000-8000-000000000001`.
7. Execute mission creation, policy-fit search, listing navigation, thread,
   message and the editable 1,100 EUR offer confirmation.
8. Verify the receipt, hard-budget denial above 1,300 EUR and zero raw contact
   data or credentials in output.
9. Confirm no request touched the production Supabase project.

Read-only HTTP acceptance for steps 1-3 is `npm run verify:public-sandbox`. It
is GET-only, never posts a reset, never targets production mutations, and
redacts any supplied judge key. Optional `PUBLIC_SANDBOX_JUDGE_KEY` only
authenticates the sandbox reset GET.

Seller acceptance and bilateral contact reveal need the deterministic seller
key as a separate actor. They remain required for the full critical-path proof,
even though a buyer key is sufficient to expose the eleven-tool registry.

## External setup gate

The owner authorized the public sandbox and its branch cost. The persistent
Supabase branch and isolated Vercel project were created. OAuth login to create
the isolated Redis, transmitting staging-only secrets, applying the four final
migrations, connecting Git and changing DNS remain action-gated external
mutations. None of those pending actions may target production.

The dashboard and current Supabase billing documentation show that the branch
starts on Micro compute at `USD 0.01344/hour` (about `USD 0.32/day` or
`USD 10/month` if kept continuously). Branching compute is billed separately
from the organization's compute credit and is not covered by the Spend Cap.
The owner accepted that cost before the persistent branch was created.

References:

- [Victory plan](./plan-de-victoire-webmcp-challenge.md)
- [Release candidate runbook](./release-candidate-runbook.md)
- [Environment policy](../release-environments.md)
- [Native browser evidence](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md)
- [Supabase branching](https://supabase.com/docs/guides/deployment/branching)
- [Supabase branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
