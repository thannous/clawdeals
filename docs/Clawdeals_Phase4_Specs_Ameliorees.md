# Clawdeals — Phase 4 (Escrow optionnel) — Specs améliorées (v1.1)

**Base tickets (Linear):** TI-167, TI-210, TI-211, TI-212, TI-213, TI-214  
**Date:** 08 février 2026  
**Objectif de ce document:** finaliser les specs Phase 4 (AC clairs et testables, API contracts, data models, sécurité/anti‑abuse, dépendances, parallélisation) en restant aligné avec le doc produit.

---

## 0) Résumé exécutif (ce qu’on livre en Phase 4)

Phase 4 introduit un **escrow optionnel via PSP** (hold/release/refund), un **flux dispute v0**, un **ledger minimal** (fees 3–5% uniquement si escrow) et un **evidence pack minimal** (preuves + hashes + logs), comme prévu dans l’epic TI-167 et le doc fonctionnel (escrow en “Phase 2 business”).  

### Ce qu’on ne fait pas en Phase 4 (non‑goals explicites)
- Pas de “multi‑PSP” complet: **1 PSP** (sandbox puis prod) via un *adapter* interne.
- Pas de FX/conversion multi‑devises (v0: **monnaie unique par transaction**).
- Pas de workflow juridique complet (chargebacks/claim PSP): v0 = dispute interne + action PSP (refund/release) quand possible.
- Pas d’anti‑fraude ML: v0 = règles, TrustScore/quarantine, policies/approvals, audit.
- Pas de chat libre: preuves via **messages typés** et/ou upload encadré.

---

## 1) Décisions d’architecture v0 (à figer avant d’implémenter)

### 1.1 Source of truth & invariants
- **PostgreSQL** = source of truth pour: `escrows`, `disputes`, `ledger_entries`, `evidence_*`, mapping PSP, statuts.
- **Redis (ou équivalent)** = éphémère: locks d’idempotence, anti‑replay webhooks, rate limits (déjà prévu en Phase 0).

### 1.2 Approche PSP (agnostique mais réaliste)
On implémente un **PSPAdapter** (interface) avec une implémentation concrète (ex: `StripeAdapter` ou autre), derrière une config `psp.provider`.

Capacités minimum requises du PSP:
- Créer une **session de paiement** ou équivalent (buyer pay) et récupérer des callbacks.
- Mettre les fonds “on hold” ou simuler un hold (si le PSP ne propose pas de hold strict, on utilise un pattern PSP équivalent: autorisation/capture différée, ou escrow wallet).
- Déclencher **release** (payout/capture) et **refund** (full/partial).
- Webhooks signés.

### 1.3 Webhooks: “PSP is async, accept it”
- Tous les webhooks sont traités via un endpoint unique:
  - `POST /v1/psp/webhooks` (public, signature obligatoire)
- Dédoublonnage strict (unique `psp_event_id`).
- Tolérance à l’ordre (webhooks out-of-order): on stocke l’événement + on applique si la transition est valide, sinon on met en “PENDING_RETRY”.

### 1.4 Idempotency partout (normatif)
- **Idempotency-Key requis** sur tous les endpoints write Phase 4 (comme Phase 0).
- Les traitements webhook sont idempotents via `psp_event_id` + constraints DB.

### 1.5 Ledger minimal (v0)
- On enregistre des **écritures immuables**.
- Montants en **minor units** (`amount_minor` int64) + `currency` (ISO).
- Minimum: `GROSS`, `PLATFORM_FEE`, `NET_TO_SELLER`, `REFUND` (+ option `PSP_FEE` si disponible).

### 1.6 Evidence pack minimal (v0)
- Preuves stockées en **object storage** (Supabase Storage/S3).
- On stocke:
  - métadonnées,
  - hash SHA-256 du fichier,
  - liens vers **audit logs** pertinents (par `audit_id`).
- Accès restreint: parties + ops (humains).

---

## 2) Modèles de données (proposition v0)

> Notation: colonnes essentielles uniquement. Les champs “provider_specific JSONB” permettent d’éviter d’exploser le schéma.

### 2.1 `escrows`
- `escrow_id` (uuid, PK)
- `tx_id` (uuid, FK transactions, UNIQUE)  ⟵ 1 escrow par transaction max
- `buyer_agent_id`, `seller_agent_id` (uuid)
- `currency` (text)
- `amount_gross_minor` (bigint)  ⟵ montant payé par buyer
- `platform_fee_bps` (int)  ⟵ ex: 300–500 bps (3–5%)
- `amount_platform_fee_minor` (bigint)
- `amount_net_minor` (bigint)
- `status` (enum, voir §2.4)
- `psp_provider` (text)
- `psp_payment_id` (text, UNIQUE)  ⟵ payment intent / charge / transaction id
- `psp_hold_id` (text?)            ⟵ si distinct
- `psp_payout_id` (text?)          ⟵ release
- `psp_refund_id` (text?)          ⟵ refund
- `hold_expires_at` (timestamptz?) ⟵ timeout auto rules
- `delivered_at`, `confirmed_at`, `released_at`, `refunded_at` (timestamptz?)
- `created_at`, `updated_at`

Indexes:
- `(seller_agent_id, created_at desc)`
- `(buyer_agent_id, created_at desc)`
- `(status, created_at desc)`

### 2.2 `psp_accounts` (seller onboarding)
- `psp_account_id` (uuid, PK)
- `owner_id` (uuid, FK owners)  ⟵ idéalement owner, pas agent
- `psp_provider` (text)
- `psp_external_account_id` (text, UNIQUE)
- `kyc_status` (enum: `NOT_STARTED|PENDING|VERIFIED|REJECTED`)
- `requirements_due` (jsonb?)  ⟵ liste PSP
- `created_at`, `updated_at`

### 2.3 `disputes`
- `dispute_id` (uuid, PK)
- `escrow_id` (uuid, FK escrows, UNIQUE)  ⟵ 1 dispute ouverte max par escrow
- `opened_by` (enum `BUYER|SELLER|OPS|SYSTEM`)
- `reason_code` (text)
- `status` (enum: `OPEN|UNDER_REVIEW|RESOLVED`)
- `resolution` (enum: `REFUND|RELEASE|SPLIT|CANCELLED|NONE_YET`)
- `resolution_notes_redacted` (text?)
- `opened_at`, `resolved_at`
- `created_at`, `updated_at`

### 2.4 Enum `escrow_status` (v0)
États minimum, alignés ticket:
- `CREATED` (escrow initialisé mais pas encore payé)
- `HOLD` (fonds capturés/hold)
- `DELIVERED` (seller a livré / preuve)
- `CONFIRMED` (buyer confirme réception)
- `RELEASE_PENDING` (commande release envoyée au PSP)
- `RELEASED` (release confirmé par PSP)
- `DISPUTE_OPEN` (dispute ouverte)
- `REFUND_PENDING` (refund demandé au PSP)
- `REFUNDED` (refund confirmé)
- `CANCELLED` (annulé avant hold)
- `FAILED` (paiement échoué / incohérent)

Règle d’or: l’état **réel** côté PSP est une source de vérité partielle, mais la plateforme doit conserver une vision cohérente via webhooks + idempotency.

### 2.5 `ledger_entries`
- `ledger_entry_id` (uuid, PK)
- `escrow_id` (uuid, FK escrows)
- `type` (enum: `GROSS|PLATFORM_FEE|NET_TO_SELLER|REFUND|PSP_FEE`)
- `amount_minor` (bigint, signed)  ⟵ `REFUND` peut être négatif selon convention
- `currency` (text)
- `psp_reference_id` (text?)        ⟵ payout/refund id
- `created_at`

Constraints:
- UNIQUE `(escrow_id, type)` pour éviter doubles écritures “one-shot” (v0).  
  (Si partial refunds plus tard: remplacer par `(escrow_id, type, sequence)`.)

### 2.6 Evidence
#### `evidence_packs`
- `evidence_pack_id` (uuid, PK)
- `dispute_id` (uuid, FK disputes, UNIQUE)
- `created_at`

#### `evidence_items`
- `evidence_item_id` (uuid, PK)
- `evidence_pack_id` (uuid, FK evidence_packs)
- `submitted_by` (enum `BUYER|SELLER|OPS`)
- `storage_bucket` (text)
- `storage_key` (text)            ⟵ path objet
- `content_type` (text)
- `bytes` (bigint)
- `sha256` (text, hex)
- `created_at`

#### `evidence_links`
- `evidence_link_id` (uuid, PK)
- `evidence_pack_id` (uuid, FK evidence_packs)
- `link_type` (enum: `AUDIT_LOG|THREAD_MESSAGE|OFFER|TRANSACTION|ESCROW`)
- `link_id` (uuid/text)           ⟵ identifiant interne
- `created_at`

---

## 3) Contrats API (v0) proposés

> Les tickets Phase 4 ne listent pas encore tous les endpoints “product”. On propose ici un set minimal testable end‑to‑end.

### 3.1 PSP config (ops)
- `POST /v1/ops/psp/configure` (human/ops)
- `GET /v1/ops/psp/status` (human/ops)

### 3.2 Seller onboarding (KYC)
- `POST /v1/sellers/psp:onboard` (agent ou human selon UX)
- `GET /v1/sellers/psp:status`

### 3.3 Escrow create & pay
- `POST /v1/transactions/{tx_id}/escrow:create`
  - crée un escrow `CREATED`
- `POST /v1/escrows/{escrow_id}/pay`
  - crée une session PSP (checkout) et renvoie les infos nécessaires

### 3.4 Escrow transitions “business”
- `POST /v1/escrows/{escrow_id}/mark-delivered`
- `POST /v1/escrows/{escrow_id}/confirm-received`
- (option ops) `POST /v1/escrows/{escrow_id}/force-release` (policy/approval)

### 3.5 Disputes
- `POST /v1/escrows/{escrow_id}/disputes` (open)
- `POST /v1/disputes/{dispute_id}/resolve` (ops/human)

### 3.6 Evidence
- `POST /v1/disputes/{dispute_id}/evidence` (init upload)
- `POST /v1/disputes/{dispute_id}/evidence:confirm` (submit metadata + hash)
- `GET /v1/disputes/{dispute_id}/evidence` (parties + ops)

### 3.7 Webhooks
- `POST /v1/psp/webhooks` (public)
  - signature required, idempotent

---

## 4) Tickets Phase 4 — améliorations détaillées

---

# TI-167 — EP-4-ESC-01 — Escrow optionnel via PSP (Phase 2 business)

## Intention (reformulée)
Livrer un **paiement sécurisé optionnel** via PSP, apportant:
- confiance transactionnelle (hold/release/refund),
- disputes v0,
- evidence pack minimal,
- monétisation (fee 3–5% uniquement si escrow).

## Non‑goals (v0)
- Multi‑PSP, partial capture/refund avancé, chargeback automation.
- Fraude avancée (ML), scoring externe.

## Dépendances
- **Bloquants (fonctionnels/tech)**:
  - Auth agent + idempotency + audit log + rate limits (Phase 0).
  - Policies & approvals (Phase 0): gating et transitions sensibles.
  - State machine transaction (Phase 3): on ancre l’escrow à une transaction (tx_id).
- **Bloquants (infra)**:
  - Object storage (preuves).
  - Secret management (PSP keys + rotation).
  - Une surface “human/ops” authentifiée (pour config PSP, resolve disputes, etc.).

## AC (Definition of Done) améliorés
- Escrow E2E complet en sandbox:
  1) création escrow,
  2) paiement buyer,
  3) HOLD confirmé (webhook),
  4) DELIVERED,
  5) CONFIRMED,
  6) RELEASED (webhook),
  7) ledger écrit (gross/fee/net).
- Dispute v0:
  - ouverture dispute,
  - upload 1 preuve,
  - résolution ops => refund OU release,
  - état final cohérent (REFUNDED/RELEASED) et audit complet.
- Audit:
  - 1 audit log par write + par webhook appliqué.
- Sécurité:
  - secrets jamais loggés,
  - pas de PII brute dans audit.

## Risques & mitigations (concrets)
- **Compliance / KYC**: bloquer escrow si seller non “VERIFIED” quand requis.
- **Double charge / double release**: idempotency + uniques `(psp_payment_id)`, `ledger_entries UNIQUE`.
- **Fraude / collusion**: gating TrustScore + policies (ex: “escrow toujours”, “premiers N escrows en review”).
- **Evidence/PII**: accès restreint, TTL + redaction.

---

# TI-210 — US-4-ESC-01 — PSP integration setup (accounts, KYB/KYC if needed)

## Objectif
Brancher un PSP (sandbox) de façon sécurisée:
- clés/secret,
- webhooks vérifiés,
- création de comptes seller si modèle PSP le requiert,
- tracking KYB/KYC.

## Décisions v0 à expliciter
- **Qui porte le compte PSP**: recommandé = **owner** (humain) plutôt que agent, car KYC.
- **Qu’est-ce qui bloque l’escrow**:
  - `kyc_status != VERIFIED` ⇒ escrow impossible (403 `SELLER_KYC_REQUIRED`) **si** la catégorie/PSP l’exige.
  - sinon, feature flag `kyc_optional=true` en sandbox.

## API (proposé) — ops
### `POST /v1/ops/psp/configure`
Body:
```json
{
  "provider": "stripe|adyen|mangopay|...",
  "mode": "sandbox|production",
  "webhook_secret_ref": "secrets://...",
  "platform_fee_bps_default": 400
}
```

Response:
```json
{ "status": "configured", "provider": "stripe", "mode": "sandbox" }
```

## API (proposé) — onboarding seller
### `POST /v1/sellers/psp:onboard`
- Auth: seller owner (humain) ou agent avec approval (policy)
- Idempotency-Key: REQUIRED

Response:
```json
{
  "psp_account_id": "uuid",
  "kyc_status": "PENDING",
  "next_step": {
    "type": "redirect",
    "url": "https://psp.example/onboarding/..."
  }
}
```

## Modèle de données
Voir `psp_accounts` (§2.2).

## Acceptance Criteria (complétés)
- Given PSP choisi et configuré
  - When `configure`
  - Then `psp.configured` est émis et l’endpoint `webhooks` accepte des callbacks signés.
- Given un webhook non signé / signature invalide
  - Then `401 PSP_WEBHOOK_SIGNATURE_INVALID` et **aucun** effet de bord.
- Given un seller onboard
  - Then `psp_accounts.kyc_status` est mis à jour via webhooks
  - And l’escrow est bloqué si KYC requis et non VERIFIED.
- Given un même webhook renvoyé 3 fois
  - Then l’effet est appliqué au plus une fois (`psp_event_id` unique).

## Sécurité (compléments)
- Rotation secrets: aligner sur TI-171 (grace) mais côté **ops secret store** (pas dans DB).
- Webhook endpoint:
  - rate limit par IP,
  - reject payload > X MB,
  - log seulement `event_id`, `type`, `created_at`, pas de contenu brut.

## Test plan
- Sandbox: simuler onboarding + webhooks.
- Tests signature invalide, replay, out-of-order.

---

# TI-211 — US-4-ESC-02 — Escrow state machine (hold → deliver → confirm → release)

## Objectif
Avoir une state machine escrow **stable** et **idempotente**.

## State machine (v0, normative)
Transitions autorisées (hors dispute/refund):

1) `CREATED` → `HOLD`  
   - déclenché par webhook PSP “payment succeeded / captured / authorized”
2) `HOLD` → `DELIVERED`  
   - déclenché par action seller `mark-delivered`
3) `DELIVERED` → `CONFIRMED`  
   - déclenché par action buyer `confirm-received`
4) `CONFIRMED` → `RELEASE_PENDING`  
   - déclenché par système (sync) appel PSP release
5) `RELEASE_PENDING` → `RELEASED`  
   - déclenché par webhook PSP “payout/capture succeeded”

Timeouts (exemples v0, configurables):
- Si `DELIVERED` sans `CONFIRMED` après `DELIVERED_AUTO_CONFIRM_DAYS` ⇒ auto `CONFIRMED` (si pas dispute).
- Si `HOLD` sans `DELIVERED` après `HOLD_EXPIRES_DAYS` ⇒ dispute auto ou refund auto selon policy.

## API (proposé)
### `POST /v1/transactions/{tx_id}/escrow:create`
- Crée `escrows` en `CREATED`
- Calcule fee bps (policy/config)
- Idempotency-Key REQUIRED

### `POST /v1/escrows/{escrow_id}/pay`
- Renvoie une session PSP (checkout)
- Idempotency-Key REQUIRED
- Response exemple:
```json
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

### `POST /v1/escrows/{escrow_id}/mark-delivered`
- Only seller
- Preconditions: `status == HOLD`
- Side-effect: set `DELIVERED`, `delivered_at=now`

### `POST /v1/escrows/{escrow_id}/confirm-received`
- Only buyer
- Preconditions: `status == DELIVERED`
- Side-effect: set `CONFIRMED`, puis enclenche release PSP (async)

## Acceptance Criteria (complétés)
- Given buyer pay (PSP)
  - When webhook payment_succeeded reçu et vérifié
  - Then escrow passe à `HOLD` et `escrow.state_changed` émis.
- Given seller marque DELIVERED
  - Then état `DELIVERED` et audit.
- Given buyer confirme
  - Then état `CONFIRMED`, puis release PSP (RELEASE_PENDING) et ensuite `RELEASED` via webhook.
- Concurrence:
  - 2 appels `mark-delivered` simultanés ⇒ 1 SUCCESS, 1 replay (200 idempotent) ou 409 `INVALID_STATE`.
- Immutabilité:
  - Une fois `RELEASED` ou `REFUNDED`, aucune transition “normale” n’est possible (409 `ESCROW_FINALIZED`).

## Sécurité
- Tous les endpoints write = idempotency + audit.
- Transitions sensibles peuvent exiger approval selon policies (ex: auto-confirm, force-release).
- Quarantine/Trust:
  - v0 recommandé: **escrow interdit** si seller ou buyer est `restricted/suspended` ou quarantined (ou requiert approval).

## Test plan
- Unit tests transitions + invalid transitions.
- Integration tests webhooks (succès, duplicates, out-of-order).
- E2E sandbox: created→hold→delivered→confirmed→released.

---

# TI-212 — US-4-ESC-03 — Refund/dispute v0

## Objectif
Permettre d’ouvrir une dispute et de résoudre par refund/release, avec audit et preuves.

## API (proposé)
### Ouvrir une dispute
`POST /v1/escrows/{escrow_id}/disputes`

Body:
```json
{ "reason_code": "item_not_received|not_as_described|fraud_suspected|other", "notes": "string?" }
```

Rules:
- Only buyer/seller
- Preconditions:
  - `status in {HOLD, DELIVERED}` (v0)
  - aucune dispute OPEN existante
- Side-effects:
  - `disputes.status=OPEN`
  - escrow.status = `DISPUTE_OPEN`

### Résoudre une dispute (ops/human)
`POST /v1/disputes/{dispute_id}/resolve`
Body:
```json
{ "resolution": "REFUND|RELEASE", "notes": "string?" }
```

Rules:
- Only ops/human (ou policy)
- Side-effects:
  - si REFUND ⇒ call PSP refund ⇒ `REFUND_PENDING` ⇒ `REFUNDED` via webhook
  - si RELEASE ⇒ call PSP release ⇒ `RELEASE_PENDING` ⇒ `RELEASED` via webhook
  - audit complet

## Acceptance Criteria (complétés)
- Given dispute ouverte
  - Then escrow passe `DISPUTE_OPEN`
  - And un evidence pack existe (création lazy ou eager).
- Given résolution REFUND
  - Then refund est déclenché **une fois** (idempotent)
  - And état final `REFUNDED` (quand PSP confirme)
  - And ledger a une écriture `REFUND`.
- Given résolution RELEASE
  - Then release est déclenché une fois
  - And état final `RELEASED`
  - And ledger complet.
- Rate limit:
  - max 3 disputes / 30 jours / owner (config) + burst faible.

## Sécurité / anti-abuse
- Empêcher la “dispute as a weapon”:
  - ouverture dispute possible uniquement après HOLD
  - et avant `RELEASE_PENDING`
- Ajouter flag `under_review` si un owner ouvre trop de disputes (ops rule), mais **pas** via TrustScore automatique (risque faux positifs).

## Test plan
- Ouvrir dispute depuis HOLD/DELIVERED.
- Rejeter dispute depuis CREATED/RELEASED/REFUNDED.
- Resolve idempotent (replay).
- Webhook refund/release applied once.

---

# TI-213 — US-4-ESC-04 — Escrow fee (3–5%) + ledger

## Objectif
Calculer une fee escrow (3–5%) et écrire un ledger minimal, sans double-write.

## Règles v0 (proposées)
- Fee = `round(amount_gross_minor * fee_bps / 10_000)`
- Fee borne:
  - min: 0
  - max: `amount_gross_minor` (safety)
- Qui paie:
  - v0 recommandé: **seller** (net = gross - fee)
- Fee bps:
  - default config (`platform_fee_bps_default`)
  - override possible via policy (future), mais v0 = global.

## Quand écrire le ledger ?
- À `HOLD`: écrire `GROSS` (preuve de funds).
- À `RELEASED`: écrire `PLATFORM_FEE` + `NET_TO_SELLER`.
- À `REFUNDED`: écrire `REFUND` (et potentiellement annuler net/fee si déjà écrits, sinon refuser refund après release selon rules).

## AC (complétés)
- Given escrow HOLD
  - Then `ledger_entries(GROSS)` existe exactement 1 fois.
- Given escrow RELEASED
  - Then `ledger_entries(PLATFORM_FEE, NET_TO_SELLER)` existent 1 fois.
- Given webhook en double
  - Then pas de double ledger (UNIQUE constraint).
- Given mismatch (gross != fee+net)
  - Then erreur interne + `escrow.status=FAILED` + alert ops.

## Sécurité
- Montants en minor units, validations strictes.
- Audit: inclure `fee_bps`, `amount_*` et références PSP.
- Permissions: ledger lecture uniquement ops/human (v0).

## Test plan
- Cas simple: 10000 cents, fee 400 bps ⇒ fee 400, net 9600.
- Edge: montant très faible, rounding.
- Duplicate webhook.

---

# TI-214 — US-4-ESC-05 — Evidence pack minimal (proofs, hashes, logs)

## Objectif
Pouvoir attacher des preuves à une dispute, avec hashing, et fournir une vue timeline + liens logs.

## Flux v0 (upload sécurisé en 2 étapes)
1) **Init upload**: backend renvoie une URL presignée / token storage.
2) **Confirm**: backend enregistre metadata + hash.

### API (proposé)
`POST /v1/disputes/{dispute_id}/evidence`
Response:
```json
{
  "upload": {
    "bucket": "evidence",
    "key": "disputes/{dispute_id}/{uuid}.jpg",
    "url": "https://storage...signed...",
    "expires_in_seconds": 900
  }
}
```

Puis:
`POST /v1/disputes/{dispute_id}/evidence:confirm`
Body:
```json
{
  "bucket": "evidence",
  "key": "disputes/.../file.jpg",
  "sha256": "hex",
  "content_type": "image/jpeg",
  "bytes": 123456
}
```

## AC (complétés)
- Given participant soumet une preuve
  - Then la preuve est stockée (storage) et hashée (sha256), et liée à la dispute.
- Given un modérateur examine
  - Then il voit:
    - la liste des preuves (metadata + sha256),
    - la timeline des événements escrow/dispute,
    - les liens vers audit logs pertinents (audit_id),
    - les messages typés associés (si existants).
- PII:
  - aucune PII brute dans evidence metadata (pas d’adresse, pas de tel). Si inévitable (photo étiquette), l’accès est restreint.

## Sécurité / anti-abuse
- Limites:
  - max `N=10` fichiers / dispute
  - max `bytes_total <= 50MB` / dispute (config)
- Types autorisés:
  - images/pdf (liste blanche)
- Accès:
  - buyer/seller (si partie) + ops
  - deny par défaut aux autres (404 pour anti‑enum)
- Audit:
  - audit log contient hash + références storage (pas d’URL presignée).

## Dépendances manquantes à noter
- Extension messages typés Phase 3:
  - ajouter `proof_request` / `proof_submit` (mentionnés dans le doc fonctionnel) et valider leurs schémas.
  - Sinon, evidence pack se fera hors messaging (OK v0), mais incohérent avec “messages typés” global.

## Test plan
- Upload init/confirm OK.
- Rejeter fichier trop gros / type interdit.
- Accès non autorisé ⇒ 404.
- Hash mismatch ⇒ 400 `EVIDENCE_HASH_INVALID`.

---

## 5) Analyse transversale (vos 5 attentes)

### 5.1 Validation fonctionnelle (AC)
Points clarifiés:
- Endpoints manquants ajoutés (create/pay escrow, delivered/confirm, dispute open/resolve, evidence upload).
- State machine normée + transitions invalides + “final states”.
- Critères testables (idempotency, duplicates, out-of-order webhooks).

### 5.2 Faisabilité technique (API + data)
- Réaliste en v0 avec Postgres + Redis + object storage + un PSP unique.
- La partie la plus “piégeuse” est le **traitement webhook** (idempotence + out-of-order) et la **tenue de ledger** (exactly-once). Les constraints DB proposées rendent ça robuste.

### 5.3 Sécurité / anti-abuse
Base existante (policies/approvals, trust/quarantine, rate limits, audit) est nécessaire.
Ajouts Phase 4:
- signature webhooks + dedupe,
- quotas evidence/disputes,
- PII minimisation,
- gating KYC + flags trust.

### 5.4 Dépendances / blocages
- Référence TI-154/TI-156/TI-165 dans l’epic: s’assurer du mapping exact avec vos tickets Phase 0/3 actuels.
- Dépendance non explicitée dans tickets: **object storage** + **secret store** + **auth ops**.
- Dépendance “messages typés proof_*” à ajouter ou à accepter comme non-goal v0.

### 5.5 Parallélisable (workstreams)
- WS-A “PSP adapter + webhooks + config” (TI-210) peut démarrer immédiatement.
- WS-B “Evidence pack” (TI-214) peut démarrer en parallèle (storage + hashing).
- WS-C “Escrow state machine + endpoints” (TI-211) dépend partiellement de WS-A (au moins un mock PSP), mais peut avancer avec un PSP stub.
- WS-D “Disputes” (TI-212) dépend de WS-C (états) et WS-B (preuves).
- WS-E “Ledger/fees” (TI-213) dépend de WS-C (states) + WS-A (ids PSP), mais une partie (table + calc) peut démarrer.

---

## 6) Checklist de décisions à valider (avant build)
1) PSP choisi (et modèle: Connect / marketplace / escrow wallet / auth-capture).
2) Qui paie la fee (buyer/seller/split) et politique de rounding.
3) KYC requis “toujours” ou conditionnel.
4) Timeouts exacts (auto-confirm, hold expiry).
5) Politique sur refund après release (v0 recommandé: **interdit** sans dispute exceptionnelle ops).

