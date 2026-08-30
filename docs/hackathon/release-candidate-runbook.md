# Release candidate runbook (TI-376)

Scope: document how to turn the challenge baseline into the final TI-376 release candidate, then report LOCAL / CI / DEPLOYED / PUBLIC proof separately. The first candidate `3f10575` passed the clean-clone release gate and historical CI. Reviewed runtime implementation `2ed489d` passed the expanded local gate, Vercel deployment, public HTTP and native Codex guest WebMCP proof; current GitHub Actions was explicitly waived. The authenticated public sandbox, candidate/final tags, public video and Devpost remain pending. See `RELEASE_EVIDENCE_2026-08-26.md`.

SHA roles:

- Challenge eligibility baseline (already tagged): `webmcp-challenge-baseline` = `00880457964929c0773237a9c724704f5da651f0`
- TI-376 input SHA (current `HEAD` at runbook authoring): `425b4140d82daa709dd205e348cb82caa8f23a28` (`425b414`, TI-377 evals). This is **not** the TI-376 release candidate.
- Reviewed runtime implementation: `2ed489d5a5086f449c9985d9627f2d024032e3a3`. Later documentation-only descendants do not change that runtime proof.
- TI-376 release candidate SHA: resolve it from the clean reviewed HEAD with `CANDIDATE_SHA=$(git rev-parse HEAD)` after this runbook and the release files are committed. `<TI376_CANDIDATE_SHA>` is an operator placeholder only; record the exact value in Linear and the candidate tag without editing this file after validation.
- Repo: `https://github.com/thannous/clawdeals`
- Ticket: [TI-376](https://linear.app/ti-max/issue/TI-376/hackathon-produire-un-build-reproductible-et-une-preuve-live-stable)

Plan links for this SHA split:

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

Hard rules:

- Isolated local or staging Supabase only. Never production project `gztfmpuqtpvncdcuhqxy`.
- Never copy production secrets into `.env.local`, CI, previews, or this runbook.
- `CLAWDEALS_ENV=sandbox` must not point at production.
- Do not treat a local gate as CI, deployment, or public proof.
- After Devpost submission, freeze the submitted repo and site unless an explicit blocking-fix decision is recorded.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Plan sections: [§13](https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md#13-plan-de-travail-jusquau-3-septembre), [§17](https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md#17-structure-du-d%C3%A9p%C3%B4t-public)
- Local path: `docs/hackathon/plan-de-victoire-webmcp-challenge.md`

Companion docs: `HACKATHON.md`, `README.md`, `docs/sandbox-getting-started.md`, `docs/local-supabase-development.md`, `docs/hosting-cloudflare-vercel.md`, `docs/release-environments.md`, `evals/webmcp/README.md`, `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`.

## Proof layers

| Layer | What it proves | What it does not prove |
| --- | --- | --- |
| LOCAL | Clean clone of `<TI376_CANDIDATE_SHA>` (must include `425b414` plus the TI-376 release files) can copy `.env.example`, migrate, seed synthetic fixtures, and pass `release:hackathon:local` | GitHub CI, Vercel/Cloudflare deploy, public URL |
| CI | GitHub Actions on `<TI376_CANDIDATE_SHA>` | Playwright WebMCP gate, live site |
| DEPLOYED | Vercel app and Cloudflare router serve this SHA | Judge-visible public behavior |
| PUBLIC | Private-window judge smoke on the live URL | Local tests or CI |

Fill evidence only after that layer actually ran. Unexecuted cells stay `PENDING`.

Do not treat `425b414` as the judged candidate. It is the last committed input before the TI-376 files. Preflight, CI, deploy, tags, and public smoke all target `<TI376_CANDIDATE_SHA>`.

---

## 1. LOCAL — clean clone through `release:hackathon:local`

### References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

### Prerequisites

- Node `24.19.0` from `.nvmrc`; engines require Node `>=24.19.0 <25` and npm `>=11.17.0 <12`
- Docker
- Supabase CLI
- Isolated Redis compatible with `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (required by Playwright integration)

### Clone and pin the TI-376 candidate

```bash
git clone https://github.com/thannous/clawdeals.git
cd clawdeals
git switch main
git pull --ff-only origin main
export CANDIDATE_SHA="$(git rev-parse HEAD)"
test "$CANDIDATE_SHA" = '<TI376_CANDIDATE_SHA>'
git merge-base --is-ancestor 425b4140d82daa709dd205e348cb82caa8f23a28 HEAD
git merge-base --is-ancestor webmcp-challenge-baseline HEAD
```

### Install

```bash
npm ci
npx playwright install --with-deps
```

### Isolated local Supabase and migrations

```bash
supabase start
supabase status --output env
supabase db reset
```

`supabase start` brings up local Postgres/Auth/API on `127.0.0.1:54321`. `supabase db reset` reapplies `supabase/migrations/` on that isolated instance, including `20260826170000_ti_377_offer_accept_lock_order.sql`. Do not target a remote project.

`supabase/seed.sql` is intentionally empty so a schema reset never imports production-like data. The deterministic marketplace fixtures are created only after the sandbox API starts, through the scoped reset endpoint below.

Stop when done: `supabase stop`.

### Env setup without secrets

Copy the committed template, then fill only local values. Never commit `.env.local`. Generate HMAC/idempotency values locally; copy only keys printed by local `supabase status`.

```bash
cp .env.example .env.local
# example generators — local use only
openssl rand -hex 32
```

Edit `.env.local`. Keep every `replace-with-*` placeholder until it is a local credential. The committed `.env.example` already contains:

```bash
CLAWDEALS_ENV=sandbox
API_KEY_NAMESPACE=cd_sandbox
NEXT_PUBLIC_WEBMCP_ENABLED=1
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
IDEMPOTENCY_SECRET=replace-with-local-idempotency-secret
AUDIT_HMAC_SECRET=replace-with-local-audit-secret
MESSAGE_REDACTION_HMAC_SECRET=replace-with-local-redaction-secret
OWNER_SESSION_SECRET=replace-with-local-owner-session-secret
UPSTASH_REDIS_REST_URL=http://127.0.0.1:55400
UPSTASH_REDIS_REST_TOKEN=replace-with-local-redis-token
WEBMCP_JUDGE_AGENT_ID=93000000-0000-4000-8000-000000000001
```

Optional local defaults used by Playwright prod-mode webServer: `INTERNAL_CRON_SECRET`, `AUTH_ALLOW_LEGACY_IDENTITY_HEADERS=1` (test-only; must stay unset in production).

Reject the run if `SUPABASE_URL` contains `gztfmpuqtpvncdcuhqxy`. Seed, smoke, and Playwright already fail closed on that host.

### App, local synthetic seed, and deterministic WebMCP judge bootstrap

```bash
npm run dev:sandbox
```

In another shell:

```bash
# general synthetic sandbox fixtures (deals/listings/watchlists for the seeded agent)
npm run seed:dev:sandbox
```

The general seed above is a local legacy helper. It creates or reuses a random
agent and may use test-only identity headers. It must not be used to provision
the public judge.

For the public isolated host, set the branch-specific Supabase URLs, the exact
`https://sandbox.clawdeals.com` public URLs and the fixed judge ID shown above.
After migrations, validate the plan without a service-role key or network call:

```bash
npm run bootstrap:webmcp:judge
```

Only after the dry-run succeeds and the isolated branch/host are confirmed,
provide the staging service-role key and explicitly apply:

```bash
npm run bootstrap:webmcp:judge -- --apply
```

The bootstrap intentionally does not load `.env.local` or `.env` on its own.
Export the reviewed staging-only values in the current shell. This prevents an
ambient developer or production credential from being combined with the
sandbox command.

The apply command uses service-role access only from the operator shell. It
upserts owner `94000000-0000-4000-8000-000000000001` and judge agent
`93000000-0000-4000-8000-000000000001`, rotates isolated `cd_sandbox` buyer
and seller keys, calls the judge reset twice, and writes the raw keys only to
the gitignored `.env.webmcp-judge.local` file with mode `0600`. It never prints
the raw keys. Existing secret files are never overwritten. Production hosts,
the production Supabase ref, mismatched branch refs, Vercel default hosts and
legacy identity headers fail before any database mutation.
`SUPABASE_SERVICE_ROLE_PROJECT_REF` must explicitly equal the isolated branch
ref, and `NEXT_PUBLIC_WEBMCP_ENABLED` must equal `1`.

Judge reset returns `403` for any other agent and `404` when sandbox/judge
identity is not configured. Fixtures are synthetic only: one buyer mission,
one synthetic seller, five e-bikes plus two supporting listings, one stable
thread, and no real email or phone.

Local API smoke (still non-prod only):

```bash
npm run test:smoke
```

`scripts/smoke-api.mjs` requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IDEMPOTENCY_SECRET`, and `MESSAGE_REDACTION_HMAC_SECRET` or `AUDIT_HMAC_SECRET`. Default base is `http://localhost:3000`.

### Build and local submission gate

```bash
npm run release:hackathon:local
```

`release:hackathon:preflight` (`scripts/verify-hackathon-release.mjs`) is LOCAL only: clean `main`, ancestor of `webmcp-challenge-baseline`, required public files including `.env.example` / `.nvmrc`, Node 24, npm `11.17.0`, and a secret-shaped `.env.example` check. It explicitly reports `deployment`, `public_smoke`, and `devpost_submission` as `NOT_CHECKED`.

`release:hackathon:local` is `release:hackathon:preflight && eval:webmcp:gate`. The gate is `typecheck && lint && test:unit && build && eval:webmcp:selection && eval:webmcp:contracts && eval:webmcp:ui && eval:webmcp:journey && eval:webmcp:security`. Journey and security stages need the isolated sandbox env above. Playwright refuses known production Supabase/API hosts. Preflight requires a clean working tree, so run it on the committed `<TI376_CANDIDATE_SHA>`, not on uncommitted WIP.

Judge-facing local pages after `npm run dev:sandbox`: `/webmcp-challenge` and `/webmcp`.

### LOCAL evidence

| Check | Command / artifact | Result |
| --- | --- | --- |
| Historical first clean-clone SHA | `git rev-parse HEAD` | PASS on `3f1057541ac3fd523fbc89f0ea4b367e52077026` |
| Input ancestor | `425b414` is ancestor of HEAD | PASS on `3f10575` |
| `cp .env.example .env.local` then local placeholders replaced | file exists locally, not committed | PASS on `3f10575` |
| `npm ci` | install log | PASS: 1,030 packages, 0 vulnerabilities |
| `supabase start` / `supabase db reset` | all migrations + `supabase/seed.sql` | PASS on `3f10575` |
| `npm run seed:dev:sandbox` | masked synthetic seed JSON | PASS: 3 deals, 7 listings, 3 watchlists |
| `POST /api/v1/sandbox/reset` `mode=webmcp_challenge` | isolated journey and two-reset specs | PASS: 2/2 journey gate |
| `npm run test:smoke` | owner session + CSRF + API workflow | PASS after the smoke-script session/CSRF refresh; rerun required in final clean clone |
| `npm run build` | production build | PASS: 110 pages |
| `npm run release:hackathon:preflight` | JSON `status=PASS`, `proof_layer=LOCAL_PREFLIGHT` | PASS on `3f10575` |
| `npm run release:hackathon:local` | includes `eval:webmcp:gate` | PASS on `3f10575` |
| `npm run eval:webmcp:gate` | 373 Vitest files; selector, contracts, UI, journey, security | PASS on `3f10575` |
| Reviewed implementation preflight | `npm run release:hackathon:preflight` on clean `2ed489d` | PASS |
| Reviewed implementation full gate | `npm run release:hackathon:local` on clean `2ed489d` | PASS: 377 Vitest files / 2,634 passed / 1 skipped, 109-page build, selector 24 x 3, contracts 82/82, UI 6/6, journey 2/2, security 10/10 |

A prior local eval index in `evals/webmcp/README.md` is not this runbook's evidence.

---

## 2. CI — GitHub Actions on the candidate SHA

### References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

Workflow: `.github/workflows/ci.yml` on `push` to `main` and pull requests. Inspect the run for `<TI376_CANDIDATE_SHA>`, not `425b414`.

Jobs: `lint`, `contracts` (`typecheck`, i18n, OpenAPI, skill pack), sharded `test:unit`, Cloudflare worker contracts plus `wrangler deploy --dry-run`, then aggregator `test-ci`.

CI does **not** run `eval:webmcp:gate`, Playwright UI, or sandbox journey/security. Passing CI is not a WebMCP submission gate.

Inspect:

- Commit: https://github.com/thannous/clawdeals/commit/425b4140d82daa709dd205e348cb82caa8f23a28
- Candidate commit (after root creates it): https://github.com/thannous/clawdeals/commit/<TI376_CANDIDATE_SHA>
- Actions: https://github.com/thannous/clawdeals/actions/workflows/ci.yml

### CI evidence

| Check | Artifact | Result |
| --- | --- | --- |
| Workflow run for `3f10575` | [CI run 32959645029](https://github.com/thannous/clawdeals/actions/runs/32959645029) | PASS |
| `lint` | job result | PASS |
| `contracts` | job result | PASS |
| `unit_tests` | both shards | PASS |
| `worker_contracts` | job result | PASS |
| `test-ci` aggregator | job result | PASS |
| Current reviewed implementation | GitHub checks on `2ed489d` | WAIVED / NOT RUN by owner; neither PASS nor FAIL |

Do not claim CI green unless the run for this SHA is open and successful.

---

## 3. DEPLOYED — Vercel + Cloudflare pinned to `<TI376_CANDIDATE_SHA>`

### References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

Topology (`docs/hosting-cloudflare-vercel.md`):

- Marketing/edge: `https://clawdeals.com` via `workers/edge-router.ts`
- App: `https://app.clawdeals.com` via Vercel Git integration, region `dub1`
- Staging only: `https://staging.app.clawdeals.com` / project `clawdeals-staging`

This runbook does not deploy. Production deploy requires an explicit later authorization. Commands, if later authorized:

```bash
# Cloudflare edge router only — do not run unless production deploy is authorized
npm run deploy:cloudflare
```

Vercel production follows Git integration on `main`. Confirm the deployment SHA equals `<TI376_CANDIDATE_SHA>` before calling the public site a candidate. `425b414` is only the input ancestor.

Judge reset must stay off production. `POST /api/v1/sandbox/reset` is sandbox-only and should 404 in production.

Candidate then final tags (plan §13). Do not create or push tags from this document:

```bash
# later, after LOCAL+CI+DEPLOYED+PUBLIC are actually green
git tag -a webmcp-challenge-candidate-<TI376_CANDIDATE_SHA> <TI376_CANDIDATE_SHA>
git push origin webmcp-challenge-candidate-<TI376_CANDIDATE_SHA>
# final tag only after Devpost freeze decision
git tag -a webmcp-challenge-final <TI376_CANDIDATE_SHA>
git push origin webmcp-challenge-final
```

Existing tag `webmcp-challenge-baseline` marks pre-challenge commit `0088045` and is not the candidate.

### DEPLOYED evidence

| Check | Artifact | Result |
| --- | --- | --- |
| Vercel production deployment SHA | GitHub commit status + public hub | PASS on reviewed implementation `2ed489d`; later documentation-only descendants may be the displayed SHA |
| Cloudflare worker version | wrangler/dashboard version vs SHA | PENDING |
| Staging SHA (if used) | `clawdeals-staging` deployment | PASS — runtime `deb00e3`, deployment `dpl_5qjh93UvcATeEcZpC8SNn1VJEuqJ` Ready |
| Candidate tag created and pushed | `git ls-remote --tags origin` | PENDING |
| Final tag created and pushed | `git ls-remote --tags origin` | PENDING |
| Production sandbox reset returns 404 | `curl -i https://clawdeals.com/api/v1/sandbox/reset` | PASS |

---

## 4. PUBLIC — private-window judge smoke

### References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

Only valid after DEPLOYED proof shows the live hosts serve `<TI376_CANDIDATE_SHA>`. Follow `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. Do not use production data or real contact details.

URLs:

- Judge hub: `https://clawdeals.com/webmcp-challenge`
- Marketplace demo: `https://clawdeals.com/webmcp`

Private-window smoke:

1. Open the hub in a clean private profile.
2. Confirm the page loads and reports native `document.modelContext` (or record `INDETERMINATE` if the browser has no WebMCP).
3. Without a key, record the five public tools: `get_page_context`, `show_listings`, `open_listing`, `search_listings`, `get_action_receipt`.
4. With the allowlisted judge agent only on an isolated sandbox host, reset with `mode=webmcp_challenge` and record the eleven authenticated tools. Skip this step on production (expect 404).
5. Paste the Paris e-bike mission from the hub / `HACKATHON.md`.
6. Record first selected tool and sequence.
7. Approve a compliant action; deny a protected one.
8. Record the receipt id. Confirm no API key, email, phone, or raw contact data in model output.

Chrome path, if used: Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. ChatGPT in-app browser is a separate row.

### PUBLIC evidence

| Check | Artifact | Result |
| --- | --- | --- |
| Hub HTTP 200, commit/build identity if shown | HTTP headers + rendered HTML | PASS on reviewed implementation `2ed489d`; later documentation-only descendants may be displayed |
| Public tool registry (5 tools) | Codex in-app native discovery | PASS — exact five guest tools retained across challenge to browse navigation |
| Authenticated registry (11 tools) | hub inspector, sandbox only | PASS under explicit Playwright compatibility injection on `deb00e3` |
| Public listings/API read | network/status | PASS — public listings HTTP 200 |
| Judge reset | sandbox 2xx / production 404 | PASS — authenticated sandbox reset 200; production reset 404 |
| Critical path mission → confirmation → receipt | receipt id | PASS — mission, 1,150 EUR offer, seller acceptance, `RESERVED`, redacted receipt and idempotent replay; 1/1 in 6.7 s |
| ChatGPT in-app WebMCP | `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` | PENDING — NOT RUN |
| Chrome WebMCP | `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` | INDETERMINATE — tested Chrome profile exposed no `document.modelContext` |
| PII/secret scan | none found / found | PASS — authenticated receipt excludes both synthetic keys, email, phone and raw contact data; <=1,500 bytes |

Lack of WebMCP in a given browser is `INDETERMINATE`, not a pass or fail.

---

## 5. Freeze after submission

### References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk

When PUBLIC proof is captured and Devpost is submitted:

- Do not change the submitted Devpost entry.
- Do not change the submitted git SHA or tags.
- Do not deploy a different SHA to the judged URL.
- Continue later work in a fork or a non-submitted checkout.

Freeze decision: PENDING

---

## 6. Operator checklist vs TI-376

| Acceptance | Layer | Status in this runbook |
| --- | --- | --- |
| Clean clone + install + migrations + demo seed + build documented | LOCAL | PASS on historical clean-clone `3f10575`; expanded reviewed-runtime gate PASS on `2ed489d` |
| `.env.example` without secrets + judge instructions | LOCAL / PUBLIC | LOCAL PASS; full private-window verification pending |
| `release:hackathon:local` | LOCAL | PASS on clean reviewed implementation `2ed489d` |
| Vercel/Cloudflare attached to candidate commit | DEPLOYED | Vercel and public Cloudflare-routed HTTP PASS on reviewed implementation `2ed489d`; exact Cloudflare worker-version mapping remains pending |
| Public private-window smoke: page, tools, APIs, reset, critical path | PUBLIC | PASS for HTTP, APIs, reset separation and injected authenticated critical path; native Chrome remains INDETERMINATE and ChatGPT NOT RUN |
| Candidate tag then final tag created and pushed | DEPLOYED | Commands listed; not executed |
| LOCAL / CI / DEPLOYED / PUBLIC reported separately | all | Tables above |
| No post-submission change without explicit decision | freeze | PENDING |

This file is the TI-376 artifact. External PENDING cells and the final clean-clone rerun require later authorized work against `<TI376_CANDIDATE_SHA>`, not against `425b414`.
