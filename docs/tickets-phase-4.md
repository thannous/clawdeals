# Clawdeals — Phase 4 (Escrow optionnel) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 08 février 2026
**Scope:** tickets Phase/P4 (TI-167, TI-210 à TI-214)
**Specs améliorées:** `docs/Clawdeals_Phase4_Specs_Ameliorees.md`

---

## TI-167 — EP-4-ESC-01 — Escrow optionnel via PSP (Phase 2 business)

**URL:** https://linear.app/ti-max/issue/TI-167/ep-4-esc-01-escrow-optionnel-via-psp-phase-2-business
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Compliance, Channel/API, Phase/P4, Area/Billing, Type/Epic
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-167-ep-4-esc-01-escrow-optionnel-via-psp-phase-2-business`
**Blocked By:** TI-156 (Policies & Approvals), TI-154 (AgentPassport & Auth), TI-165 (Contact Reveal & Completion)

### Intention (reformulée)

Livrer un **paiement sécurisé optionnel** via PSP, apportant:
- confiance transactionnelle (hold/release/refund),
- disputes v0,
- evidence pack minimal,
- monétisation (fee 3–5% uniquement si escrow).

### Non‑goals (v0)

- Multi‑PSP complet: **1 PSP** (sandbox puis prod) via un *adapter* interne.
- FX/conversion multi‑devises (v0: **monnaie unique par transaction**).
- Workflow juridique complet (chargebacks/claim PSP): v0 = dispute interne + action PSP quand possible.
- Anti‑fraude ML: v0 = règles, TrustScore/quarantine, policies/approvals, audit.
- Chat libre: preuves via **messages typés** et/ou upload encadré.

### Scope

* PSP integration setup (accounts, KYB/KYC si besoin) — TI-210
* Escrow state machine — TI-211
* Refund/dispute v0 — TI-212
* Fees + ledger — TI-213
* Evidence pack minimal (proofs + hashes + logs) — TI-214

### Décisions d'architecture v0

- **PostgreSQL** = source of truth (`escrows`, `disputes`, `ledger_entries`, `evidence_*`, mapping PSP, statuts).
- **Redis** = éphémère: locks d'idempotence, anti‑replay webhooks, rate limits.
- **PSPAdapter** (interface) avec une implémentation concrète (ex: `StripeAdapter`), derrière config `psp.provider`.
- **Webhooks**: endpoint unique `POST /v1/psp/webhooks`, signature obligatoire, dédoublonnage strict (`psp_event_id`), tolérance out-of-order.
- **Idempotency-Key** requis sur tous les endpoints write Phase 4.
- **Ledger**: écritures immuables, montants en minor units (`amount_minor` int64) + `currency` ISO.
- **Evidence**: object storage (Supabase Storage/S3), hash SHA-256, accès restreint parties + ops.

### Dépendances

**Bloquants (fonctionnels/tech)**:
- Auth agent + idempotency + audit log + rate limits (Phase 0)
- TI-156: Policies & Approvals — gating et transitions sensibles
- TI-154: AgentPassport & Auth
- TI-165: Contact Reveal & Completion — state machine transaction (tx_id)

**Bloquants (infra)**:
- Object storage (preuves)
- Secret management (PSP keys + rotation)
- Surface "human/ops" authentifiée (config PSP, resolve disputes)

### Definition of Done (améliorés)

- [ ] Escrow E2E complet en sandbox:
  1. création escrow
  2. paiement buyer
  3. HOLD confirmé (webhook)
  4. DELIVERED
  5. CONFIRMED
  6. RELEASED (webhook)
  7. ledger écrit (gross/fee/net)
- [ ] Dispute v0:
  - ouverture dispute
  - upload 1 preuve
  - résolution ops → refund OU release
  - état final cohérent (REFUNDED/RELEASED) et audit complet
- [ ] Audit: 1 audit log par write + par webhook appliqué
- [ ] Sécurité: secrets jamais loggés, pas de PII brute dans audit

### Risques & mitigations

| Risque | Mitigation |
|--------|-----------|
| Compliance / KYC | Bloquer escrow si seller non "VERIFIED" quand requis |
| Double charge / double release | Idempotency + UNIQUE `(psp_payment_id)`, `ledger_entries UNIQUE` |
| Fraude / collusion | Gating TrustScore + policies (ex: "escrow toujours", "premiers N escrows en review") |
| Evidence/PII | Accès restreint, TTL + redaction |

### Parallélisation (workstreams)

- **WS-A** "PSP adapter + webhooks + config" (TI-210) — peut démarrer immédiatement
- **WS-B** "Evidence pack" (TI-214) — peut démarrer en parallèle (storage + hashing)
- **WS-C** "Escrow state machine + endpoints" (TI-211) — dépend partiellement de WS-A (mock PSP), peut avancer avec un PSP stub
- **WS-D** "Disputes" (TI-212) — dépend de WS-C (états) et WS-B (preuves)
- **WS-E** "Ledger/fees" (TI-213) — dépend de WS-C (states) + WS-A (ids PSP), partie (table + calc) peut démarrer

---

## TI-210 — US-4-ESC-01 — PSP integration setup (accounts, KYB/KYC if needed)

**URL:** https://linear.app/ti-max/issue/TI-210/us-4-esc-01-psp-integration-setup-accounts-kybkyc-if-needed
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-210-us-4-esc-01-psp-integration-setup-accounts-kybkyc-if-needed`
**Parent:** TI-167 (Epic)

### User Story

En tant que plateforme, je veux intégrer un PSP pour proposer un escrow optionnel (paiement sécurisé) quand c'est nécessaire.

### Objectif

Brancher un PSP (sandbox) de façon sécurisée:
- clés/secret,
- webhooks vérifiés,
- création de comptes seller si modèle PSP le requiert,
- tracking KYB/KYC.

### Décisions v0

- **Qui porte le compte PSP**: recommandé = **owner** (humain) plutôt que agent, car KYC.
- **Qu'est-ce qui bloque l'escrow**:
  - `kyc_status != VERIFIED` ⇒ escrow impossible (403 `SELLER_KYC_REQUIRED`) **si** la catégorie/PSP l'exige.
  - sinon, feature flag `kyc_optional=true` en sandbox.

### API contracts

#### `POST /v1/ops/psp/configure` (ops/human)
```json
// Body
{
  "provider": "stripe|adyen|mangopay|...",
  "mode": "sandbox|production",
  "webhook_secret_ref": "secrets://...",
  "platform_fee_bps_default": 400
}
// Response
{ "status": "configured", "provider": "stripe", "mode": "sandbox" }
```

#### `GET /v1/ops/psp/status` (ops/human)

#### `POST /v1/sellers/psp:onboard`
- Auth: seller owner (humain) ou agent avec approval (policy)
- Idempotency-Key: REQUIRED
```json
// Response
{
  "psp_account_id": "uuid",
  "kyc_status": "PENDING",
  "next_step": {
    "type": "redirect",
    "url": "https://psp.example/onboarding/..."
  }
}
```

#### `GET /v1/sellers/psp:status`

### Data model

Table `psp_accounts`:
- `psp_account_id` (uuid, PK)
- `owner_id` (uuid, FK owners)
- `psp_provider` (text)
- `psp_external_account_id` (text, UNIQUE)
- `kyc_status` (enum: `NOT_STARTED|PENDING|VERIFIED|REJECTED`)
- `requirements_due` (jsonb?)
- `created_at`, `updated_at`

### Acceptance Criteria (complétés)

* Given PSP choisi et configuré
  * When `configure`
  * Then `psp.configured` est émis et l'endpoint `webhooks` accepte des callbacks signés.
* Given un webhook non signé / signature invalide
  * Then `401 PSP_WEBHOOK_SIGNATURE_INVALID` et **aucun** effet de bord.
* Given un seller onboard
  * Then `psp_accounts.kyc_status` est mis à jour via webhooks
  * And l'escrow est bloqué si KYC requis et non VERIFIED.
* Given un même webhook renvoyé 3 fois
  * Then l'effet est appliqué au plus une fois (`psp_event_id` unique).

### Telemetry (events)

* `psp.configured`
* `psp.webhook_received`

### Sécurité (compléments)

- Rotation secrets: aligner sur TI-171 (grace) mais côté **ops secret store** (pas dans DB).
- Webhook endpoint:
  - rate limit par IP,
  - reject payload > X MB,
  - log seulement `event_id`, `type`, `created_at`, pas de contenu brut.

### Test plan

- Sandbox: simuler onboarding + webhooks.
- Tests signature invalide, replay, out-of-order.

### Definition of Done

* PSP sandbox opérationnel + webhooks reçus et vérifiés
* Webhook signature validation + dedupe
* KYC tracking fonctionnel

---

## TI-211 — US-4-ESC-02 — Escrow state machine (hold → deliver → confirm → release)

**URL:** https://linear.app/ti-max/issue/TI-211/us-4-esc-02-escrow-state-machine-hold-→-deliver-→-confirm-→-release
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-211-us-4-esc-02-escrow-state-machine-hold-deliver-confirm`
**Parent:** TI-167 (Epic)

### User Story

En tant que système, je veux une state machine escrow stable (hold → deliver → confirm → release) avec sorties refund/dispute.

### State machine (v0, normative)

#### `escrow_status` enum
`CREATED` → `HOLD` → `DELIVERED` → `CONFIRMED` → `RELEASE_PENDING` → `RELEASED`
Branches: `DISPUTE_OPEN`, `REFUND_PENDING` → `REFUNDED`, `CANCELLED`, `FAILED`

#### Transitions autorisées (hors dispute/refund)

1. `CREATED` → `HOLD` — webhook PSP "payment succeeded / captured / authorized"
2. `HOLD` → `DELIVERED` — action seller `mark-delivered`
3. `DELIVERED` → `CONFIRMED` — action buyer `confirm-received`
4. `CONFIRMED` → `RELEASE_PENDING` — système appel PSP release
5. `RELEASE_PENDING` → `RELEASED` — webhook PSP "payout/capture succeeded"

#### Timeouts (configurables)

- Si `DELIVERED` sans `CONFIRMED` après `DELIVERED_AUTO_CONFIRM_DAYS` ⇒ auto `CONFIRMED` (si pas dispute).
- Si `HOLD` sans `DELIVERED` après `HOLD_EXPIRES_DAYS` ⇒ dispute auto ou refund auto selon policy.

### Data model

Table `escrows`:
- `escrow_id` (uuid, PK)
- `tx_id` (uuid, FK transactions, UNIQUE) — 1 escrow par transaction max
- `buyer_agent_id`, `seller_agent_id` (uuid)
- `currency` (text), `amount_gross_minor` (bigint)
- `platform_fee_bps` (int), `amount_platform_fee_minor` (bigint), `amount_net_minor` (bigint)
- `status` (enum escrow_status)
- `psp_provider` (text), `psp_payment_id` (text, UNIQUE), `psp_hold_id`, `psp_payout_id`, `psp_refund_id`
- `hold_expires_at` (timestamptz?)
- `delivered_at`, `confirmed_at`, `released_at`, `refunded_at`
- `created_at`, `updated_at`

Indexes: `(seller_agent_id, created_at desc)`, `(buyer_agent_id, created_at desc)`, `(status, created_at desc)`

### API contracts

#### `POST /v1/transactions/{tx_id}/escrow:create`
- Crée `escrows` en `CREATED`, calcule fee bps (policy/config)
- Idempotency-Key REQUIRED

#### `POST /v1/escrows/{escrow_id}/pay`
- Renvoie une session PSP (checkout)
- Idempotency-Key REQUIRED
```json
// Response
{
  "escrow_id": "uuid",
  "status": "CREATED",
  "psp": {
    "payment_id": "pi_...",
    "checkout_url": "https://...",
    "expires_at": "2026-02-08T12:00:00Z"
  }
}
```

#### `POST /v1/escrows/{escrow_id}/mark-delivered`
- Only seller
- Preconditions: `status == HOLD`
- Side-effect: set `DELIVERED`, `delivered_at=now`

#### `POST /v1/escrows/{escrow_id}/confirm-received`
- Only buyer
- Preconditions: `status == DELIVERED`
- Side-effect: set `CONFIRMED`, puis release PSP (async)

#### (ops) `POST /v1/escrows/{escrow_id}/force-release`
- Policy/approval required

### Acceptance Criteria (complétés)

* Given buyer pay (PSP)
  * When webhook payment_succeeded reçu et vérifié
  * Then escrow passe à `HOLD` et `escrow.state_changed` émis.
* Given seller marque DELIVERED
  * Then état `DELIVERED` et audit.
* Given buyer confirme
  * Then état `CONFIRMED`, puis release PSP (`RELEASE_PENDING`) et ensuite `RELEASED` via webhook.
* **Concurrence**:
  * 2 appels `mark-delivered` simultanés ⇒ 1 SUCCESS, 1 replay (200 idempotent) ou 409 `INVALID_STATE`.
* **Immutabilité**:
  * Une fois `RELEASED` ou `REFUNDED`, aucune transition "normale" n'est possible (409 `ESCROW_FINALIZED`).

### Telemetry (events)

* `escrow.state_changed`

### Sécurité

- Tous les endpoints write = idempotency + audit.
- Transitions sensibles peuvent exiger approval selon policies (ex: auto-confirm, force-release).
- **Quarantine/Trust**: v0 recommandé: escrow interdit si seller ou buyer est `restricted/suspended` ou quarantined (ou requiert approval).

### Test plan

- Unit tests transitions + invalid transitions.
- Integration tests webhooks (succès, duplicates, out-of-order).
- E2E sandbox: created→hold→delivered→confirmed→released.

### Definition of Done

* State machine implémentée + tests transitions
* Concurrence gérée (idempotency + INVALID_STATE)
* Final states (RELEASED/REFUNDED) immutables

---

## TI-212 — US-4-ESC-03 — Refund/dispute v0

**URL:** https://linear.app/ti-max/issue/TI-212/us-4-esc-03-refunddispute-v0
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-212-us-4-esc-03-refunddispute-v0`
**Parent:** TI-167 (Epic)

### User Story

En tant qu'utilisateur, je veux ouvrir une dispute et demander un refund quand la transaction a un problème.

### Objectif

Permettre d'ouvrir une dispute et de résoudre par refund/release, avec audit et preuves.

### Data model

Table `disputes`:
- `dispute_id` (uuid, PK)
- `escrow_id` (uuid, FK escrows, UNIQUE) — 1 dispute ouverte max par escrow
- `opened_by` (enum `BUYER|SELLER|OPS|SYSTEM`)
- `reason_code` (text)
- `status` (enum: `OPEN|UNDER_REVIEW|RESOLVED`)
- `resolution` (enum: `REFUND|RELEASE|SPLIT|CANCELLED|NONE_YET`)
- `resolution_notes_redacted` (text?)
- `opened_at`, `resolved_at`
- `created_at`, `updated_at`

### API contracts

#### Ouvrir une dispute: `POST /v1/escrows/{escrow_id}/disputes`
```json
// Body
{ "reason_code": "item_not_received|not_as_described|fraud_suspected|other", "notes": "string?" }
```
Rules:
- Only buyer/seller
- Preconditions: `status in {HOLD, DELIVERED}` (v0), aucune dispute OPEN existante
- Side-effects: `disputes.status=OPEN`, escrow.status = `DISPUTE_OPEN`

#### Résoudre une dispute (ops/human): `POST /v1/disputes/{dispute_id}/resolve`
```json
// Body
{ "resolution": "REFUND|RELEASE", "notes": "string?" }
```
Rules:
- Only ops/human (ou policy)
- Side-effects:
  - si REFUND ⇒ call PSP refund ⇒ `REFUND_PENDING` ⇒ `REFUNDED` via webhook
  - si RELEASE ⇒ call PSP release ⇒ `RELEASE_PENDING` ⇒ `RELEASED` via webhook
  - audit complet

### Acceptance Criteria (complétés)

* Given dispute ouverte
  * Then escrow passe `DISPUTE_OPEN`
  * And un evidence pack existe (création lazy ou eager).
* Given résolution REFUND
  * Then refund est déclenché **une fois** (idempotent)
  * And état final `REFUNDED` (quand PSP confirme)
  * And ledger a une écriture `REFUND`.
* Given résolution RELEASE
  * Then release est déclenché une fois
  * And état final `RELEASED`
  * And ledger complet.
* **Rate limit**: max 3 disputes / 30 jours / owner (config) + burst faible.

### Telemetry (events)

* `dispute.opened`
* `dispute.resolved`

### Sécurité / anti-abuse

- Empêcher la "dispute as a weapon":
  - ouverture dispute possible uniquement après HOLD et avant `RELEASE_PENDING`
- Ajouter flag `under_review` si un owner ouvre trop de disputes (ops rule), mais **pas** via TrustScore automatique (risque faux positifs).
- Audit complet; rate limits sur disputes.

### Test plan

- Ouvrir dispute depuis HOLD/DELIVERED.
- Rejeter dispute depuis CREATED/RELEASED/REFUNDED.
- Resolve idempotent (replay).
- Webhook refund/release applied once.

### Definition of Done

* Dispute v0 end-to-end + intégration PSP
* Rate limits disputes configurés
* Idempotency sur resolve

---

## TI-213 — US-4-ESC-04 — Escrow fee (3–5%) + ledger

**URL:** https://linear.app/ti-max/issue/TI-213/us-4-esc-04-escrow-fee-3-5percent-ledger
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-213-us-4-esc-04-escrow-fee-35-ledger`
**Parent:** TI-167 (Epic)

### User Story

En tant que plateforme, je veux calculer une fee escrow (3–5%) et tenir un ledger minimal.

### Objectif

Calculer une fee escrow (3–5%) et écrire un ledger minimal, sans double-write.

### Règles v0

- Fee = `round(amount_gross_minor * fee_bps / 10_000)`
- Fee borne: min 0, max `amount_gross_minor` (safety)
- Qui paie: v0 recommandé = **seller** (net = gross - fee)
- Fee bps: default config (`platform_fee_bps_default`), override possible via policy (future), v0 = global.

### Quand écrire le ledger ?

- À `HOLD`: écrire `GROSS` (preuve de funds).
- À `RELEASED`: écrire `PLATFORM_FEE` + `NET_TO_SELLER`.
- À `REFUNDED`: écrire `REFUND` (et potentiellement annuler net/fee si déjà écrits).

### Data model

Table `ledger_entries`:
- `ledger_entry_id` (uuid, PK)
- `escrow_id` (uuid, FK escrows)
- `type` (enum: `GROSS|PLATFORM_FEE|NET_TO_SELLER|REFUND|PSP_FEE`)
- `amount_minor` (bigint, signed) — `REFUND` peut être négatif selon convention
- `currency` (text)
- `psp_reference_id` (text?)
- `created_at`

Constraints: UNIQUE `(escrow_id, type)` pour éviter doubles écritures (v0).

### Acceptance Criteria (complétés)

* Given escrow HOLD
  * Then `ledger_entries(GROSS)` existe exactement 1 fois.
* Given escrow RELEASED
  * Then `ledger_entries(PLATFORM_FEE, NET_TO_SELLER)` existent 1 fois.
* Given webhook en double
  * Then pas de double ledger (UNIQUE constraint).
* Given mismatch (gross != fee+net)
  * Then erreur interne + `escrow.status=FAILED` + alert ops.

### Telemetry (events)

* `ledger.entry_created`

### Sécurité

- Montants en minor units, validations strictes.
- Audit: inclure `fee_bps`, `amount_*` et références PSP.
- Permissions: ledger lecture uniquement ops/human (v0).
- Éviter double-write via idempotency + UNIQUE constraints.

### Test plan

- Cas simple: 10000 cents, fee 400 bps ⇒ fee 400, net 9600.
- Edge: montant très faible, rounding.
- Duplicate webhook → pas de double ledger.

### Definition of Done

* Fee calculée + ledger minimal + tests
* UNIQUE constraints empêchent doubles écritures
* Mismatch détecté → FAILED + alert

---

## TI-214 — US-4-ESC-05 — Evidence pack minimal (proofs, hashes, logs)

**URL:** https://linear.app/ti-max/issue/TI-214/us-4-esc-05-evidence-pack-minimal-proofs-hashes-logs
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-214-us-4-esc-05-evidence-pack-minimal-proofs-hashes-logs`
**Parent:** TI-167 (Epic)

### User Story

En tant que système, je veux produire un evidence pack minimal (proofs + hashes + logs) pour disputes et audit.

### Objectif

Pouvoir attacher des preuves à une dispute, avec hashing, et fournir une vue timeline + liens logs.

### Flux v0 (upload sécurisé en 2 étapes)

1. **Init upload**: backend renvoie une URL presignée / token storage.
2. **Confirm**: backend enregistre metadata + hash.

### Data model

#### `evidence_packs`
- `evidence_pack_id` (uuid, PK)
- `dispute_id` (uuid, FK disputes, UNIQUE)
- `created_at`

#### `evidence_items`
- `evidence_item_id` (uuid, PK)
- `evidence_pack_id` (uuid, FK evidence_packs)
- `submitted_by` (enum `BUYER|SELLER|OPS`)
- `storage_bucket` (text), `storage_key` (text)
- `content_type` (text), `bytes` (bigint)
- `sha256` (text, hex)
- `created_at`

#### `evidence_links`
- `evidence_link_id` (uuid, PK)
- `evidence_pack_id` (uuid, FK evidence_packs)
- `link_type` (enum: `AUDIT_LOG|THREAD_MESSAGE|OFFER|TRANSACTION|ESCROW`)
- `link_id` (uuid/text)
- `created_at`

### API contracts

#### Init upload: `POST /v1/disputes/{dispute_id}/evidence`
```json
// Response
{
  "upload": {
    "bucket": "evidence",
    "key": "disputes/{dispute_id}/{uuid}.jpg",
    "url": "https://storage...signed...",
    "expires_in_seconds": 900
  }
}
```

#### Confirm: `POST /v1/disputes/{dispute_id}/evidence:confirm`
```json
// Body
{
  "bucket": "evidence",
  "key": "disputes/.../file.jpg",
  "sha256": "hex",
  "content_type": "image/jpeg",
  "bytes": 123456
}
```

#### Read: `GET /v1/disputes/{dispute_id}/evidence` (parties + ops)

### Acceptance Criteria (complétés)

* Given participant soumet une preuve
  * Then la preuve est stockée (storage) et hashée (sha256), et liée à la dispute.
* Given un modérateur examine
  * Then il voit:
    * la liste des preuves (metadata + sha256),
    * la timeline des événements escrow/dispute,
    * les liens vers audit logs pertinents (audit_id),
    * les messages typés associés (si existants).
* **PII**: aucune PII brute dans evidence metadata (pas d'adresse, pas de tel). Si inévitable (photo étiquette), l'accès est restreint.

### Telemetry (events)

* `evidence.submitted`

### Sécurité / anti-abuse

- Limites:
  - max `N=10` fichiers / dispute
  - max `bytes_total <= 50MB` / dispute (config)
- Types autorisés: images/pdf (liste blanche)
- Accès: buyer/seller (si partie) + ops — deny par défaut aux autres (404 pour anti‑enum)
- Audit: audit log contient hash + références storage (pas d'URL presignée).

### Dépendances à noter

- Extension messages typés Phase 3: ajouter `proof_request` / `proof_submit` et valider leurs schémas. Sinon, evidence pack se fera hors messaging (OK v0).

### Test plan

- Upload init/confirm OK.
- Rejeter fichier trop gros / type interdit.
- Accès non autorisé ⇒ 404.
- Hash mismatch ⇒ 400 `EVIDENCE_HASH_INVALID`.

### Definition of Done

* Evidence pack v0 stocké + consultable + hashé
* Limites fichiers/taille appliquées
* Accès restreint (parties + ops)

---

## Résumé

| Ticket | Titre | Type | Status | Priority | Bloqué par |
|--------|-------|------|--------|----------|------------|
| TI-167 | EP-4-ESC-01 — Escrow optionnel via PSP | Epic | Backlog | High | TI-154, TI-156, TI-165 |
| TI-210 | US-4-ESC-01 — PSP integration setup | Story | Backlog | High | — |
| TI-211 | US-4-ESC-02 — Escrow state machine | Story | Backlog | High | — |
| TI-212 | US-4-ESC-03 — Refund/dispute v0 | Story | Backlog | High | — |
| TI-213 | US-4-ESC-04 — Escrow fee + ledger | Story | Backlog | High | — |
| TI-214 | US-4-ESC-05 — Evidence pack minimal | Story | Backlog | High | — |

## Dépendances inter-phases

```
Phase 0: TI-154 (Auth) ──────────┐
Phase 0: TI-156 (Policies) ──────┼──► TI-167 (Epic Escrow)
Phase 3: TI-165 (Contact Reveal) ┘         │
                                            ├── TI-210 (PSP setup)       [WS-A]
                                            ├── TI-211 (State machine)   [WS-C]
                                            ├── TI-212 (Dispute/refund)  [WS-D]
                                            ├── TI-213 (Fees/ledger)     [WS-E]
                                            └── TI-214 (Evidence pack)   [WS-B]
```

## Parallélisation (workstreams)

| WS | Ticket | Peut démarrer | Dépend de |
|----|--------|--------------|-----------|
| WS-A | TI-210 (PSP setup) | Immédiatement | — |
| WS-B | TI-214 (Evidence pack) | Immédiatement | — |
| WS-C | TI-211 (State machine) | Avec PSP stub | WS-A (partiellement) |
| WS-D | TI-212 (Disputes) | Après WS-C + WS-B | WS-C (états), WS-B (preuves) |
| WS-E | TI-213 (Ledger/fees) | Table + calc immédiatement | WS-C (states), WS-A (ids PSP) |
