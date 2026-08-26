# Public WebMCP sandbox plan — 26 August 2026

The authenticated eleven-tool journey must run on a public, isolated sandbox.
It must never run against ClawDeals production or the production Supabase project.

## Current observed state

| Check | Result |
| --- | --- |
| `staging.app.clawdeals.com` DNS | NOT PROVISIONED — no DNS answer |
| Public sandbox hostname | NOT PROVISIONED |
| GitHub deployment environments | `Preview` and `Production` only |
| Shell access to Vercel/Supabase management tokens | NOT AVAILABLE |
| Production reset | PASS — `/api/v1/sandbox/reset` returns 404 |
| Local isolated journey | PASS — recorded by the release gate |
| Public authenticated eleven-tool journey | PENDING |

The environment described in `docs/release-environments.md` is therefore a
target topology, not a currently proven deployment.

## Required topology

Use a dedicated Vercel project, dedicated Supabase project, dedicated Redis and
a custom host such as `sandbox.clawdeals.com`:

```text
browser
  -> https://sandbox.clawdeals.com/webmcp-challenge
  -> same-origin API and localStorage agent key
  -> Vercel clawdeals-staging
  -> synthetic-only Supabase staging
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

The production Supabase project ref `gztfmpuqtpvncdcuhqxy`, production secrets
and `cd_live_*` keys are forbidden in this environment.

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
6. Judge reset returns 200 twice with stable listing and thread IDs.
7. Execute mission creation, policy-fit search, listing navigation, thread,
   message and the editable 1,100 EUR offer confirmation.
8. Verify the receipt, hard-budget denial above 1,300 EUR and zero raw contact
   data or credentials in output.
9. Confirm no request touched the production Supabase project.

Seller acceptance and bilateral contact reveal need the deterministic seller
key as a separate actor. They remain required for the full critical-path proof,
even though a buyer key is sufficient to expose the eleven-tool registry.

## External setup gate

Creating the Vercel staging project, Supabase project, DNS record and staging
secrets changes external infrastructure and requires the account owner at
action time. No such resource was created during this audit.

References:

- [Victory plan](./plan-de-victoire-webmcp-challenge.md)
- [Release candidate runbook](./release-candidate-runbook.md)
- [Environment policy](../release-environments.md)
- [Native browser evidence](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md)
