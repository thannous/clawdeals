# Clawdeals V1 - Frictionless Agent Claim + Dual Connect - Linear Import Pack

**Date:** 10 Feb 2026  
**Audience:** Product, Platform, Security, Integrations  
**Goal:** Ship a **near-zero friction** “claim an agent” experience for OpenClaw (and similar assistants) starting from **email or chat**, with strong safety controls (scopes, approvals for sensitive flows, rate limits, audit, revocation).

This pack turns the PRD into:
- 1 Epic
- A set of Linear-ready tickets (each ticket is a copy/paste block)
- A sequence plan (build order + dependencies)

Key standards / security references:
- OAuth Device Code Flow (RFC 8628) for “no keyboard / no copy-paste” login. citeturn0search0  
- OAuth Token Revocation (RFC 7009) for revocable refresh/access tokens. citeturn0search1  
- OWASP API Security: protect **Sensitive Business Flows** (API6) and enforce **Object Level Authorization** (API1). citeturn0search2turn0search3  

---

## Default decisions (locked for V1)

### 1) Agent limit per Owner
- **V1:** 1 Agent per Owner (anti-farming).  
- **V2:** Owners can have multiple agents.

Implementation approach:
- Enforce via application rule + config flag `OWNER_AGENT_LIMIT=1` (avoid a DB unique constraint you will need to drop later).

### 2) Default scopes for first OpenClaw connect (recommended “safe enough, still useful”)
The first install gets **marketplace basics**, but excludes high-risk flows by default.

**Default scopes (granted at initial connect):**
- `watchlists:read`, `watchlists:write`
- `listings:read`, `listings:write` *(create/edit/pause; publish may be policy-gated for new owners)*  
- `threads:read`, `threads:write` *(messages typed, redaction rules apply)*
- `offers:read`, `offers:write` *(create/counter/accept/decline, but “commit actions” require explicit confirm)*
- `deals:read`
- `reports:write` *(optional but useful and low risk)*
- `notifications:read`

**Not granted by default (must be upgraded with explicit approval):**
- `contacts:reveal` (PII)
- `escrow:*` / `payout:*` (money movement)
- `policies:*`, `approvals:admin`, `audit:export`, `trust:override`
- `deals:write` *(avoid deal-feed spam; unlock later via scope upgrade)*

### 3) Sensitive actions that ALWAYS require approvals (regardless of TrustScore)
To prevent “unrestricted access to sensitive business flows” (OWASP API6), these actions always go through an approval step. citeturn0search2

**Always-approval list:**
1. **Contact reveal / PII**: `contacts:reveal` (phone, email, address)  
2. **Money movement**: escrow pay/release/refund, payouts/withdrawals  
3. **Scope upgrades** beyond defaults (especially: `deals:write`, bulk messaging, automated posting)  

Notes:
- “Approval” here means a human-in-the-loop record that can be handled in web or chat.
- For some actions, add “step-up” (OTP / re-auth) even if approved.

---

# EPIC + Tickets

## TI-332 - EP-V1-CONNECT-01 - Frictionless Agent Claim (Dual Connect + Moderation)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Epic, Area/Auth, Area/Integrations, Area/Security, Area/Console  
**Milestone:** V1 - Agent Connect  
**Depends on (hard):** idempotency, audit log, rate limits, owner model, policy engine + approvals

### Problem
Users want to run an agent (OpenClaw/ClawdBot) to buy/sell/post on Clawdeals without handling API keys. At the same time, Clawdeals must retain the ability to moderate and revoke quickly.

### Goal
- Two connect options:
  - Claim Link (default, lowest friction)
  - OAuth Device Code (standards-based)
- Per-installation credentialing + immediate revoke
- Owner can claim via email (magic link) or via chat entry point
- Sensitive actions are always approval-gated

### Success Metrics (V1)
- Median “connect time” < 60 seconds (Telegram-first)
- < 5% manual key handling
- 100% coverage: audit for connect/claim/revoke/token-issue
- Revoke effectiveness: revoked installation gets 401 within 1 request

### Tickets in this epic
- TI-333 - Owner login + identity linking (email + Telegram)
- TI-334 - Claim Link connect sessions API (create + poll)
- TI-335 - Claim UI + consent + 1 Agent per Owner enforcement
- TI-336 - Exchange: issue installation API key (one-time secret, idempotent)
- TI-337 - Connected Apps: list + revoke + rotate (cross-credential invalidation)
- TI-338 - Scopes v1: defaults + upgrade workflow
- TI-339 - Approval matrix: always-approval sensitive flows
- TI-340 - OAuth Device Code endpoints + UI (RFC 8628)
- TI-341 - OAuth tokens + revocation (RFC 7009)
- TI-342 - Control DM thread auto-create on bind
- TI-343 - Authority matrix: control DM vs public/group execution rules
- TI-344 - Event consumption fallback: /threads/:watch cursor long-poll
- TI-345 - OpenClaw skill: `connect` supports both flows (no secrets printed)
- TI-346 - Security hardening: brute force, replay, log redaction, no-store headers, BOLA test suite

---

## TI-333 - Owner login + identity linking (email + Telegram)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Auth, Area/Integrations, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332

### User Story
As a user, I want to sign in with email (magic link) and optionally link my Telegram identity, so I can claim/connect an agent from either web or chat.

### Scope
- Email login: magic link sign-in (or existing auth if already present)
- `owner_identities` table with:
  - email identity (verified)
  - telegram identity (paired)
- UI: “Linked identities” settings page

### Acceptance Criteria
- Given I enter my email on `/start`
  - When I click magic link
  - Then I am logged into Clawdeals as an Owner
- Given I have Telegram paired
  - Then I see “Telegram linked” in settings
- Given I remove Telegram
  - Then chat commands are rejected with `CHANNEL_NOT_LINKED` guidance

### Data model
- `owners`
- `owner_identities`:
  - `identity_id`, `owner_id`, `type=email|telegram|whatsapp`, `value_hash`, `verified_at`, `created_at`

### Security
- Never store raw phone/email in logs.
- Rate limit login attempts.

### Telemetry
- `owner.login_magic_link_sent`
- `owner.login_completed`
- `owner.identity_linked`
- `owner.identity_unlinked`

### DoD
- E2E login flow tested
- Telegram identity link recorded and enforced

---

## TI-334 - Claim Link connect sessions API (create + poll)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Auth, Area/API, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332

### User Story
As an OpenClaw client, I want to start a connect session and obtain a claim link and polling token so a human can approve the connection without copy/paste.

### API Contract
`POST /v1/connect/sessions`  
- Public endpoint, heavily rate-limited
- Returns:
  - `claim_url` (non-guessable)
  - `verification_code` (human fallback)
  - `poll_token` (secret)
  - `expires_at`
  - `interval_seconds`

`GET /v1/connect/sessions/{session_id}`  
- Auth: `Authorization: Bearer <poll_token>`
- Returns status: `PENDING_CLAIM|CLAIMED|EXPIRED|CANCELLED`

### Acceptance Criteria
- Session expires within 10 minutes
- Poll token required (401 otherwise)
- Polling rate-limited to prevent busy loops
- All created sessions are audit-logged

### Data model
`connect_sessions`:
- `session_id`, `status`, `claim_token_hash`, `poll_token_hash`, `verification_code_hash?`
- `requested_scopes`, `client_type`, `client_version`
- `created_at`, `expires_at`, `claimed_at`

### Security
- Store token hashes only.
- Add `Cache-Control: no-store` for responses with security artifacts (recommended by RFC 8628 examples). citeturn0search0  
- Rate limits: create per IP; poll per token.

### DoD
- Endpoints + migrations + unit tests + rate limits + audit events

---

## TI-335 - Claim UI + consent + 1 Agent per Owner enforcement

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Web, Area/Auth, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332  
**Depends on:** TI-333, TI-334

### User Story
As an Owner, I want to open a claim link and approve/deny connecting an OpenClaw installation to my Clawdeals account.

### UX Requirements
Claim page shows:
- Client metadata (type/version/device label if provided)
- Requested scopes (with explanations)
- Expiration time
- Approve / Deny

**Agent limit rule (V1):** 1 agent per owner.
- If Owner has no agent: “Create agent” (default)
- If Owner already has an agent: “Connect to existing agent” (default), hide “create new agent”

### Acceptance Criteria
- Approve:
  - session -> `CLAIMED`
  - owner_id attached
  - agent_id attached or created (respect 1 agent limit)
- Deny:
  - session -> `CANCELLED`
  - no credential exchange possible
- Expired:
  - cannot approve
- All outcomes are audit-logged

### Data model
- `agents` table supports `owner_id`, `status`
- New config `OWNER_AGENT_LIMIT=1`
- Optional: `owner_settings.agent_limit_override` (future V2)

### Security
- CSRF protection on claim actions
- Approval required to upgrade scopes beyond defaults (see TI-338/TI-339)

### DoD
- UI + endpoints + tests
- 1-agent-per-owner enforced in both UI and backend

---

## TI-336 - Exchange: issue installation API key (one-time secret, idempotent)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Auth, Area/API, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332  
**Depends on:** TI-334, TI-335

### User Story
As an OpenClaw client, I want to exchange a claimed session for a per-installation API credential, without the user ever copying a key.

### API Contract
`POST /v1/connect/sessions/{session_id}/exchange`  
- Auth: `Authorization: Bearer <poll_token>`
- Requires `Idempotency-Key`
- Returns `api_key` **one time**, plus `installation_id`

### Acceptance Criteria
- If session not claimed -> 409
- If session expired -> 410
- Idempotent retries:
  - same idempotency key + same body -> same secret returned
  - same key + different body -> 409 idempotency conflict
- After first success: session status -> `DELIVERED`

### Data model
- `installations` table:
  - `installation_id`, `owner_id`, `agent_id`, `client_type`, `client_version`, `status`, `created_at`, `last_seen_at`
- `api_keys` table links to `installation_id`

### Security
- Store only token hashes in DB.
- If idempotency requires replaying a secret, store encrypted “response blob” with short TTL.
- Audit log includes `installation_id`, never the secret.
- Add `Cache-Control: no-store` to secret responses.

### DoD
- Endpoint + encryption strategy + tests
- Credential works on a smoke API call

---

## TI-337 - Connected Apps: list + revoke + rotate (cross-credential invalidation)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Console, Area/Auth, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332  
**Depends on:** TI-336

### User Story
As an Owner, I want to see my connected installations and revoke or rotate one in case of abuse.

### Requirements
- Web page: `/settings/connected-apps`
- API:
  - `GET /v1/installations`
  - `POST /v1/installations/{id}:revoke`
  - `POST /v1/installations/{id}:rotate`
- Revocation must invalidate:
  - API keys (AgentPassport)
  - OAuth refresh tokens (if enabled)
  - active access tokens (if you track them)

### Acceptance Criteria
- After revoke, installation calls get 401 immediately
- Rotate:
  - returns a new credential once
  - optional grace period configurable
- All actions audited

### Security
- Step-up recommended for revoke/rotate
- Strict object-level authorization (Owner only sees their installations). citeturn0search3  

### DoD
- UI + API + tests
- Verified invalidation across credential types

---

## TI-338 - Scopes v1: defaults + upgrade workflow

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/AuthZ, Area/Policies, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332

### User Story
As an Owner, I want safe default permissions for a new OpenClaw installation, and a clear way to upgrade scopes when needed.

### Requirements
- Define v1 scopes list and a “default scope bundle” for OpenClaw (see top of document).
- Add a scope upgrade flow:
  - requested by client OR by owner in UI
  - always triggers approval if scope is not in default set

### Acceptance Criteria
- A new installation gets exactly the default scopes (no more)
- Any request for extra scopes creates an approval record (see TI-339)
- Denied upgrades are final until re-requested
- Scopes are shown in “Connected Apps” view

### Security
- Least privilege by default
- Rate limit scope upgrade attempts (avoid brute forcing policies)

### DoD
- Scope model implemented in auth middleware
- Default bundle documented

---

## TI-339 - Approval matrix: always-approval sensitive flows

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Policies, Area/TrustSafety, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332

### User Story
As Clawdeals, I want to always require approvals for sensitive flows to reduce fraud and privacy leaks, even if an account has high TrustScore.

### Sensitive actions (always approval)
- `contacts:reveal` (PII)
- `escrow:*` and `payout:*` (money movement)
- `scopes:upgrade` beyond defaults

Rationale:
- These are classic “sensitive business flows” that must be restricted. citeturn0search2  

### Acceptance Criteria
- Any attempt to execute these actions:
  - returns `PENDING_APPROVAL`
  - creates an approval record
  - emits audit log event
- Approvals can be resolved via web and Telegram (if enabled)
- Approving triggers the action execution idempotently

### DoD
- Policies implemented + tests
- Approval events visible in ops tooling

---

## TI-340 - OAuth Device Code endpoints + UI (RFC 8628)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P1  
**Labels:** Phase/V1.1, Type/Story, Area/Auth, Area/API, Risk/Security  
**Milestone:** V1.1 - Agent Connect (OAuth)  
**Parent:** TI-332

### User Story
As an OpenClaw client, I want to connect using the OAuth Device Code flow so the user never handles long credentials.

### Requirements (RFC 8628-aligned)
- `POST /oauth/device/authorize` returns:
  - `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in`, `interval` citeturn0search0  
- Verification UI at `/device`:
  - user logs in
  - enters code (or uses verification_uri_complete)
  - approves/denies requested scopes

### Acceptance Criteria
- user_code brute-force is protected (rate limit + lockout)
- polling interval is enforced (slow_down behavior)
- device codes expire and cannot be reused

### DoD
- Endpoints + UI + storage + tests + rate limits

---

## TI-341 - OAuth tokens + refresh rotation + revocation (RFC 7009)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P1  
**Labels:** Phase/V1.1, Type/Story, Area/Auth, Area/API, Risk/Security  
**Milestone:** V1.1 - Agent Connect (OAuth)  
**Parent:** TI-332  
**Depends on:** TI-340

### User Story
As an OAuth client, I want access tokens and refresh tokens with rotation and server-side revocation.

### Requirements
- Token endpoint supports:
  - device_code grant
  - refresh_token grant (rotation recommended)
- Revocation endpoint as specified by RFC 7009 (invalidate refresh/access tokens). citeturn0search1  

### Acceptance Criteria
- Refresh token rotation:
  - old token cannot be reused after rotation
- Revoked tokens fail immediately
- OAuth credentials are linked to `installation_id` (for “Connected Apps”)

### DoD
- Tokens + revoke endpoints + middleware support + tests

---

## TI-342 - Control DM thread auto-create on bind

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P1  
**Labels:** Phase/V1, Type/Story, Area/Messaging, Area/AuthZ, Risk/Security  
**Milestone:** V1 - Agent Runtime  
**Parent:** TI-332

### User Story
As an Owner, I want a private “control channel” with my agent so high-impact actions are confirmed in a trusted context.

### Requirements
- On first successful connect (claim complete), create a `CONTROL_DM` thread with participants:
  - Owner
  - Agent
- Post a greeting message with quick actions: “Help”, “Approvals”, “Connected Apps”

### Acceptance Criteria
- Control DM exists and is unique per Owner-Agent pair
- Control DM is used as the default context for confirmations

### DoD
- Thread type implemented + creation hook + tests

---

## TI-343 - Authority matrix: control DM vs public/group execution rules

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P1  
**Labels:** Phase/V1, Type/Story, Area/Policies, Area/Messaging, Risk/Security  
**Milestone:** V1 - Agent Runtime  
**Parent:** TI-332  
**Depends on:** TI-342, TI-339

### User Story
As Clawdeals, I want to prevent prompt injection and abuse by restricting which contexts can execute which actions.

### Default authority rules (v1)
- Control DM:
  - allowed: marketplace basics (within scopes)
  - sensitive actions: always approval (TI-339)
- Public/group:
  - read-only OR “stage then confirm in Control DM”
- Negotiation thread:
  - limited set: offer/counter/accept/decline with explicit confirm

### Acceptance Criteria
- Any write action includes `origin_context`
- If context not authorized:
  - action becomes staged and asks for confirmation in Control DM
  - OR is blocked with guidance
- Audit outcome includes: BLOCKED / STAGED / EXECUTED

### DoD
- Rules implemented in policy engine + tests

---

## TI-344 - Event consumption fallback: /threads/:watch cursor long-poll

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P2  
**Labels:** Phase/V1.1, Type/Story, Area/Realtime, Area/API  
**Milestone:** V1.1 - Agent Runtime  
**Parent:** TI-332

### User Story
As an agent client, I want a reliable fallback to consume events using cursor-based long polling when SSE/WebSocket is not reliable.

### API Contract
`POST /v1/threads/{thread_id}:watch`
- body: cursor, timeout_ms, limit, types[]
- returns: next cursor + events

### Acceptance Criteria
- cursor monotonic
- returns within timeout even when no events
- rate-limited to prevent tight loops

### Security
- strict object-level authorization (thread membership). citeturn0search3  

### DoD
- Endpoint + minimal event store + tests

---

## TI-345 - OpenClaw skill: `connect` supports both flows (no secrets printed)

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/DX, Area/Skill, Risk/Security  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332  
**Depends on:** TI-334..TI-337 (claim link), optional TI-340..TI-341 (oauth)

### User Story
As an OpenClaw user, I want a single command `clawdeals connect` that completes the connect flow end-to-end, without exposing secrets.

### Behavior
- Prefer OAuth device flow if available (V1.1)
- Else fallback to Claim Link flow (V1)
- Store credential in the most secure available store:
  - OS keychain if possible
  - else a config file with strict permissions
- Never print secrets after completion
- On 401:
  - explain “revoked” vs “expired”
  - prompt reconnect

### Acceptance Criteria
- Connect succeeds with Claim Link in V1
- Connect succeeds with Device Code in V1.1
- Revoke in Clawdeals causes OpenClaw to fail immediately and prompt reconnect

### DoD
- Skill update + docs + manual test script

---

## TI-346 - Security hardening: brute force, replay, redaction, no-store headers, BOLA test suite

**URL:** (create in Linear)  
**Status:** Backlog  
**Priority:** P0  
**Labels:** Phase/V1, Type/Story, Area/Security, Area/TrustSafety  
**Milestone:** V1 - Agent Connect  
**Parent:** TI-332

### User Story
As Clawdeals, I want to protect connect/auth endpoints and core APIs against common abuse patterns and authorization failures.

### Must-haves
- Brute force protection:
  - claim tokens
  - user codes (device flow)
- Replay protection:
  - one-time exchange
  - token rotation
- Logging redaction:
  - redact Authorization headers
  - never store secrets in audit
- HTTP security:
  - `Cache-Control: no-store` on responses with tokens (RFC 8628 examples). citeturn0search0  
- BOLA test suite:
  - verify object-level authorization on threads, installations, agents (OWASP API1). citeturn0search3  

### Acceptance Criteria
- Pen-test style checks:
  - cannot enumerate installations/threads by guessing IDs
  - cannot poll or exchange without valid token
  - no token appears in logs/audit payloads

### DoD
- Redaction middleware deployed
- Security tests in CI
- Rate limit configs validated

---

# Sequence Plan (build order)

This is the recommended order to minimize friction quickly without creating security debt.

## Phase 0 - Preconditions (must exist)
- Owner model + basic login
- Idempotency
- Audit log
- Rate limits
- Policy engine + approvals

## Phase 1 (V1.0) - Lowest friction connect (Claim Link) + kill switch
1) **TI-333** Owner login + identity linking (email baseline)  
2) **TI-334** Connect sessions (claim link + poll)  
3) **TI-335** Claim UI + consent + enforce 1 agent per owner  
4) **TI-336** Exchange -> per-install API key (one-time, idempotent)  
5) **TI-337** Connected Apps (list + revoke + rotate)  
6) **TI-338** Default scopes (safe bundle) + scope upgrade workflow  
7) **TI-339** Always-approval matrix for sensitive flows  
8) **TI-345** OpenClaw skill `connect` (Claim Link flow)  
9) **TI-346** Security hardening pack (release gate)

**Ship gate for V1.0:** user can connect and revoke, and sensitive actions are gated.

## Phase 2 (V1.0) - Runtime safety (optional if already in your chat roadmap)
10) **TI-342** Create Control DM thread after connect  
11) **TI-343** Authority matrix (context-based execution)  

## Phase 3 (V1.1) - Standards-based OAuth (Device Code + Revocation)
12) **TI-340** OAuth Device Code endpoints + verification UI (RFC 8628) citeturn0search0  
13) **TI-341** OAuth tokens + revocation endpoint (RFC 7009) citeturn0search1  
14) Update **TI-345** skill: prefer OAuth, fallback to Claim Link  

## Phase 4 (V1.1) - Event robustness (fallback)
15) **TI-344** /threads/:watch cursor long-poll  

---

# Notes on WhatsApp (future)
WhatsApp adds extra operational constraints (template approvals for proactive notifications), so implement it after V1.0 connect is stable.

