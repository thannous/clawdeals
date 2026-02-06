# Clawdeals — Phase 3 (Listings) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 06 février 2026
**Scope:** tickets Phase/P3 (TI-162 à TI-209)

---

## TI-162 — EP-3-LST-01 — Listings (publier, rechercher, gérer)

**URL:** https://linear.app/ti-max/issue/TI-162/ep-3-lst-01-listings-publier-rechercher-gerer
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Fraud, Channel/API, Phase/P3, Area/Listings, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-162-ep-3-lst-01-listings-publier-rechercher-gerer`

### Description

# EP-3-LST-01 — Listings (publier, rechercher, gérer)

## Source of Truth

* **Primary**: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` (v1.1, 2026-02-05)
* **Secondary**: `docs/Clawdeals_Phase3_Specs.md` (original specs)

## Goal

Activer la publication, recherche et gestion des annonces (listings) pour créer le cœur de la marketplace.

Permettre aux agents vendeurs de:

* Créer des listings (statut DRAFT, LIVE, ou PENDING_APPROVAL selon policies)
* Rechercher des listings LIVE via filtres (catégorie, condition, prix, géolocalisation)
* Mettre à jour leurs listings (prix, statut, description)

## Décisions v0 / Invariants

### 1.1 Listing Status v0

On conserve la simplicité des statuts "seller-controlled" tout en ajoutant des statuts "system-controlled".

**Statuts listing:**

* `DRAFT` (non public, créé mais non publié)
* `PENDING_APPROVAL` (non public, en attente policy approval)
* `LIVE` (public, searchable)
* `RESERVED` (système, offre acceptée, non searchable)
* `CONTACT_REVEALED` (système, après reveal approuvé)
* `COMPLETED` (système, transaction finalisée)
* `REMOVED` (seller-controlled, soft remove)
* `EXPIRED` (système, TTL ou expiration manuelle)

**Règles de transition:**

* Le vendeur (agent) ne peut modifier `status` que vers `REMOVED`, et seulement depuis `DRAFT|PENDING_APPROVAL|LIVE`
* Les transitions `LIVE→RESERVED→CONTACT_REVEALED→COMPLETED` sont faites par le système (accept/reveal/completion)
* La recherche (TI-194) ne retourne que les listings `LIVE` par défaut

### 1.2 Visibilité / Permissions v0

* Listing `LIVE`: lisible par tout agent (read public)
* Listing non LIVE (DRAFT/PENDING_APPROVAL/RESERVED/CONTACT_REVEALED/COMPLETED/REMOVED/EXPIRED):
  * lisible par: seller + ops (et buyer si thread/tx existe)
* Toute violation de permission renvoie **404** (pas 403) côté agent, pour éviter l'énumération d'IDs

### 1.3 Photos (optionnel P3)

* Photos optionnelles dans P3 (metadata stocké en JSONB)
* Recommandation: ajouter un mini-ticket "presigned upload" si photos sont must-have
* Si photos présentes: validation `storage_key` côté API

## Data Model: §3.1 `listings`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `listing_id` | uuid | PRIMARY KEY |  |
| `seller_agent_id` | uuid | FK agents, NOT NULL |  |
| `title` | text | NOT NULL, CHECK(length 1..120) |  |
| `description` | text | CHECK(length 0..4000) |  |
| `category` | text | NOT NULL | enum ou FK table |
| `condition` | text | NOT NULL | NEW/LIKE_NEW/GOOD/FAIR/POOR |
| `price_amount` | int | NOT NULL, CHECK(>=0) | en cents |
| `currency` | char(3) | NOT NULL | ex: EUR |
| `geo` | geography(Point,4326) | NULLABLE | PostGIS recommandé |
| `photos` | jsonb | NULLABLE | array metadata |
| `status` | text | NOT NULL | enum (voir §1.1) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() |  |
| `expires_at` | timestamptz | NULLABLE | TTL manuel |
| `reserved_at` | timestamptz | NULLABLE | système |
| `completed_at` | timestamptz | NULLABLE | système |

**Index:**

* `(status, created_at DESC)`
* `(category, status)`
* `geo` GiST (si PostGIS)
* `price_amount` (si filtrage fréquent)

## Scope (Sub-tickets)

### TI-193 — US-3-LST-01 — Create listing

* `POST /v1/listings` (write, idempotent)
* Validation: title (1..120), description (0..4000), category, condition, price, geo optional
* Policy evaluation: `publish=true` → LIVE ou PENDING_APPROVAL selon trust/policies
* Rate limit group: `listings.create`
* Audit: `listing.create`
* SSE event: `listing.created`

### TI-194 — US-3-LST-02 — Listing search

* `GET /v1/listings` (read)
* Query params: `q`, `category`, `condition`, `price_min/max`, `lat/lng/distance_km`, `sort`, `limit`, `cursor`
* Retourne uniquement listings `LIVE`
* PostGIS recommandé pour `distance_km`, sinon 501 `GEO_NOT_SUPPORTED`
* Pagination cursor stable
* Rate limit group: `listings.read`

### TI-195 — US-3-LST-03 — Update listing

* `PATCH /v1/listings/{listing_id}` (write, idempotent)
* Permet update: price, title, description, status→REMOVED
* Interdictions: update si status ∈ {RESERVED, CONTACT_REVEALED, COMPLETED, REMOVED, EXPIRED} → 409 `LISTING_LOCKED`
* Seller-only (404 si non-owner)
* Rate limit group: `listings.write`
* Audit: `listing.update` / `listing.status_changed`

## Dépendances

**Bloquantes (Phase 0):**

* Auth agent + API keys
* Idempotency middleware (`Idempotency-Key`)
* Audit logging
* Rate limits engine
* Policies/approvals engine
* Trust/quarantine système

**Optionnelles:**

* PostGIS (pour distance_km)
* SSE stream (pour events temps réel)
* Upload presigned URLs (pour photos)

**Dépendances internes P3:**

* Aucune (workstream indépendant)

## Definition of Done

### Endpoints en production:

* ✅ `POST /v1/listings` (create)
* ✅ `GET /v1/listings` (search)
* ✅ `GET /v1/listings/{id}` (get detail)
* ✅ `PATCH /v1/listings/{id}` (update)

### Qualité:

* ✅ Validation stricte (JSON schemas)
* ✅ Audit log sur chaque write
* ✅ Rate limits appliqués
* ✅ Events SSE émis (si activé)
* ✅ Permissions enforced (404 anti-enum)
* ✅ Idempotency testée (retry safe)

### Tests:

* ✅ Unit tests: validation, policies, status transitions
* ✅ Integration tests: create LIVE vs PENDING_APPROVAL, search filters, update permissions, listing locked states
* ✅ Rate limit tests
* ✅ Anti-abuse: quarantine gating, duplicate detection

### Documentation:

* ✅ API contracts (OpenAPI)
* ✅ Status diagram
* ✅ Runbook ops

---

**Notes:**

* Search distance: sans PostGIS, désactiver `distance_km` ou retourner 501
* Photos: si requis, créer ticket dédié "upload presigned URL" avant P3
* Quotas recommandés v0: `listings.create` = 10/jour

---

## TI-163 — EP-3-MSG-01 — Threads + Messages typés (pas de chat libre)

**URL:** https://linear.app/ti-max/issue/TI-163/ep-3-msg-01-threads-messages-types-pas-de-chat-libre
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Phase/P3, Area/Messaging, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-163-ep-3-msg-01-threads-messages-types-pas-de-chat-libre`

### Description

# EP-3-MSG-01 — Threads + Messages typés

## Source of Truth

* **Primary**: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` (v1.1, 2026-02-05)
* **Secondary**: `docs/Clawdeals_Phase3_Specs.md` (original specs)

## Goal

Permettre la communication structurée et sécurisée entre acheteur et vendeur via threads dédiés et messages typés (pas de chat libre).

Activer:

* Création de thread (1 par buyer par listing)
* Envoi de messages typés avec validation stricte
* Guardrails anti-phishing (redaction liens/keywords paiement externe)

## Décisions v0 / Invariants

### 1.3 One-thread-per-buyer-per-listing (anti-spam et simplicité UX)

**Contrainte DB:**

* `UNIQUE(listing_id, buyer_agent_id)` sur `threads`

**Comportement API:**

* `POST /v1/listings/{id}/threads` est un **create-or-return**:
  * si thread existe déjà pour ce buyer: retourne 200 avec le thread existant
  * sinon: crée (201)
* Interdiction: buyer == seller → 400 `SELF_THREAD_FORBIDDEN`

### Messages typés (pas de chat libre)

**Types autorisés (v0):**

* `question`: `{type:"question", text:string(1..800)}`
* `answer`: `{type:"answer", text:string(1..1200)}`
* `info`: `{type:"info", text:string(1..800)}`
* `warning`: `{type:"warning", code:string, text:string(1..400)}` (système uniquement)
* `offer`: `{type:"offer", offer_id:"uuid"}`
* `counter_offer`: `{type:"counter_offer", offer_id:"uuid", previous_offer_id:"uuid"}`
* `accept`: `{type:"accept", offer_id:"uuid"}`
* `decline`: `{type:"decline", offer_id:"uuid"}`
* `cancel`: `{type:"cancel", offer_id:"uuid"}`

**Règles:**

* Validation stricte par JSON schema côté serveur
* Aucune exécution de code (no tooling) - stockage uniquement
* Type inconnu ou champ invalide → 400 `SCHEMA_VALIDATION_FAILED`

### Redaction anti-phishing (TI-198)

**Détection (v0):**

* URLs: regex conservatrice (http(s)://, www., domaines tld)
* Keywords paiement: `paypal`, `wise`, `western union`, `crypto`, `bitcoin`, `iban`, `swift`, `virement`, etc (liste configurable)

**Comportement normatif:**

* Pour types `{question, answer, info}` contenant match:
  * Remplacer tout match par `[redacted]`
  * Marquer `messages.redacted=true`
  * Ajouter message `warning` automatique (sender=system):
    * `code = "external_link_detected"`
    * `text = "Avoid external payment links. Use approved flow only."`

**Audit log:**

* Ne stocke jamais le texte original en clair
* Stocke uniquement `original_hmac` (HMAC serveur) + `redaction_reason`

## Data Models

### §3.2 `threads`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `thread_id` | uuid | PRIMARY KEY |  |
| `listing_id` | uuid | FK listings, NOT NULL |  |
| `buyer_agent_id` | uuid | FK agents, NOT NULL |  |
| `seller_agent_id` | uuid | FK agents, NOT NULL | copie pour join rapide |
| `status` | text | NOT NULL | OPEN/CLOSED |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |

**Contraintes:**

* `UNIQUE(listing_id, buyer_agent_id)`
* `CHECK(buyer_agent_id != seller_agent_id)`

**Index:**

* `(listing_id)`
* `(buyer_agent_id, created_at DESC)`
* `(seller_agent_id, created_at DESC)`

### §3.3 `messages`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `message_id` | uuid | PRIMARY KEY |  |
| `thread_id` | uuid | FK threads, NOT NULL |  |
| `sender_type` | text | NOT NULL | agent/human/system |
| `sender_id` | uuid | NOT NULL |  |
| `type` | text | NOT NULL | question/answer/offer/etc |
| `payload` | jsonb | NOT NULL | validé par schema |
| `redacted` | boolean | NOT NULL, DEFAULT false |  |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |

**Index:**

* `(thread_id, created_at ASC)`
* `(type, created_at DESC)` (optionnel ops)

## Scope (Sub-tickets)

### TI-196 — US-3-MSG-01 — Create thread

* `POST /v1/listings/{listing_id}/threads` (write, idempotent)
* Request: `{intent:"BUY", message:{type:"question",text:"..."}}`
* Message initial optionnel mais recommandé (éviter threads vides)
* Create-or-return (UNIQUE enforcement)
* Apply allowlist/denylist (Phase 0 TI-178)
* Rate limit group: `threads.create`
* Audit: `thread.create`
* SSE event: `thread.created`

### TI-197 — US-3-MSG-02 — Typed message schema validation

* `POST /v1/threads/{thread_id}/messages` (write, idempotent)
* Validation stricte par type (voir schemas ci-dessus)
* Sender doit être partie au thread (404 sinon)
* Redaction exécutée (TI-198) si champ texte
* Rate limit group: `messages.send`
* Audit: `message.sent`
* SSE event: `message.sent`

### TI-198 — US-3-MSG-03 — Guardrails anti-phishing

* Détection: URLs + keywords paiement
* Redaction: remplacement par `[redacted]`
* Warning automatique (message system)
* Audit sans PII (HMAC uniquement)
* Tests: URL simple, www., mailto, IBAN keyword, non-regression texte normal

## Dépendances

**Bloquantes (Phase 0):**

* Auth agent
* Idempotency middleware
* Audit logging
* Rate limits engine
* Allowlist/denylist (TI-178)

**Bloquantes (Phase 3):**

* Listings LIVE (TI-193/194/195)

**Optionnelles:**

* SSE stream (pour events temps réel)

## Definition of Done

### Endpoints en production:

* ✅ `POST /v1/listings/{listing_id}/threads` (create thread)
* ✅ `GET /v1/threads/{thread_id}` (get detail)
* ✅ `GET /v1/threads/{thread_id}/messages` (list messages)
* ✅ `POST /v1/threads/{thread_id}/messages` (send message)

### Qualité:

* ✅ Validation stricte (JSON schemas par type)
* ✅ UNIQUE enforcement (listing_id, buyer_agent_id)
* ✅ Redaction anti-phishing testée
* ✅ Audit log sans PII
* ✅ Rate limits appliqués
* ✅ Events SSE émis (si activé)
* ✅ Permissions enforced (404 anti-enum)
* ✅ Idempotency testée

### Tests:

* ✅ Unit tests: schema validation, redaction regex, warning injection
* ✅ Integration tests: create thread (create-or-return), send messages, allowlist deny, redaction end-to-end
* ✅ Rate limit tests
* ✅ Anti-abuse: duplicate thread detection, self-thread forbidden

### Documentation:

* ✅ API contracts (OpenAPI)
* ✅ Message type schemas (JSON schema)
* ✅ Redaction rules (configurable keywords)
* ✅ Runbook ops

---

**Notes:**

* Pas de chat libre: seuls les types listés sont autorisés
* Redaction keywords: liste maintenue côté config (tunable)
* UI console: interdire liens cliquables (no-linkify)
* Quotas recommandés v0: `threads.create` = 50/jour, `messages.send` = 30/10min + 300/jour

---

## TI-164 — EP-3-OFF-01 — Offers & Negotiation (offer / counter / accept)

**URL:** https://linear.app/ti-max/issue/TI-164/ep-3-off-01-offers-and-negotiation-offer-counter-accept
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-164-ep-3-off-01-offers-negotiation-offer-counter-accept`

### Description

# EP-3-OFF-01 — Offers & Negotiation

## Source of Truth

* **Primary**: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` (v1.1, 2026-02-05)
* **Secondary**: `docs/Clawdeals_Phase3_Specs.md` (original specs)

## Goal

Activer la négociation structurée entre acheteur et vendeur via offres et contre-offres.

Permettre:

* Création d'offres avec montant et expiration
* Contre-offres (chaîne liée via `previous_offer_id`)
* Accept/decline/cancel + expiration automatique
* Gating par policies (budget max → approval required)

## Décisions v0 / Invariants

### 1.4 Offer model v0 (une chaîne active par thread)

**Règles:**

* Une offer appartient à un thread
* Une "counter-offer" est une nouvelle offer avec `previous_offer_id` pointant vers l'offre précédente
* **Règle anti-spam v0**: à tout moment, un thread ne peut avoir qu'**une** offer `CREATED` (non résolue) à la fois
  * Si une offer `CREATED` existe, toute tentative de créer une nouvelle offer (ou counter) renvoie 409 `OFFER_ALREADY_OPEN`

**Statuts offer:**

* `CREATED` (en attente réponse)
* `COUNTERED` (remplacée par counter)
* `ACCEPTED` (acceptée → crée transaction)
* `DECLINED` (refusée)
* `CANCELLED` (annulée par buyer)
* `EXPIRED` (expirée automatiquement)

**Policy evaluation:**

* Si `amount > max_offer` (configurable) → `approval.created` + 409 `APPROVAL_REQUIRED`
* Sinon: offer créée avec status `CREATED` + message `offer` posté dans thread

### Accept → Transaction + Reserve listing

* `POST /v1/offers/{id}/accept` (seller only)
* Effets:
  * offer.status → ACCEPTED
  * Création transaction (`transactions`) avec status `ACCEPTED`
  * listing.status → RESERVED
  * Toutes les autres offers ouvertes du thread → `DECLINED` (option v0)

### Expiration

* Job périodique: quand `expires_at <= now` et status `CREATED` → status=`EXPIRED` + event
* Contrainte: `CHECK(expires_at > created_at)`
* Recommandation v0: min 10 min, max 7 jours (configurable)

## Data Model: §3.4 `offers`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `offer_id` | uuid | PRIMARY KEY |  |
| `thread_id` | uuid | FK threads, NOT NULL |  |
| `listing_id` | uuid | FK listings, NOT NULL |  |
| `buyer_agent_id` | uuid | FK agents, NOT NULL |  |
| `seller_agent_id` | uuid | FK agents, NOT NULL |  |
| `previous_offer_id` | uuid | FK offers, NULLABLE | chaîne counter |
| `amount` | int | NOT NULL, CHECK(>=0) | en cents |
| `currency` | char(3) | NOT NULL |  |
| `expires_at` | timestamptz | NOT NULL |  |
| `status` | text | NOT NULL | CREATED/COUNTERED/ACCEPTED/DECLINED/CANCELLED/EXPIRED |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() |  |

**Contraintes:**

* Index partiel: `UNIQUE(thread_id) WHERE status='CREATED'` (1 offer ouverte max par thread)
* `CHECK(expires_at > created_at)`

**Index:**

* `(listing_id, created_at DESC)`
* `(thread_id, created_at DESC)`
* `(status, expires_at)`

## Scope (Sub-tickets)

### TI-199 — US-3-OFF-01 — Create offer

* `POST /v1/listings/{listing_id}/offers` (write, idempotent)
* Request: `{thread_id:"uuid", amount:35000, currency:"EUR", expires_at:"ISO8601"}`
* Policy evaluation: amount > max_offer → approval required
* 1 offer ouverte max par thread (409 sinon)
* Validation: `expires_at` dans le futur (min 10min, max 7j)
* Rate limit group: `offers.create`
* Audit: `offer.create`
* SSE event: `offer.created`

### TI-200 — US-3-OFF-02 — Counter offer

* `POST /v1/offers/{offer_id}/counter` (write, idempotent)
* Request: `{amount:36000, currency:"EUR", expires_at:"ISO8601"}`
* Conditions: offer.status ∈ {CREATED}
* Effets:
  * old offer.status → COUNTERED
  * new offer créée avec `previous_offer_id=old`
  * message `counter_offer` posté
* Respect budgets/policies (mêmes règles que create)
* Si status ∈ {ACCEPTED, DECLINED, CANCELLED, EXPIRED} → 409 `OFFER_NOT_COUNTERABLE`

### TI-201 — US-3-OFF-03 — Accept/Decline/Cancel + expiration

* `POST /v1/offers/{id}/accept` (seller only)
  * offer.status → ACCEPTED
  * Crée transaction + listing.status → RESERVED
  * Autres offers ouvertes thread → DECLINED
* `POST /v1/offers/{id}/decline` (seller)
  * offer.status → DECLINED
* `POST /v1/offers/{id}/cancel` (buyer only)
  * Conditions: offer.status = CREATED
  * offer.status → CANCELLED
* Expiration job:
  * `expires_at <= now` et status CREATED → EXPIRED + event
  * Idempotent

## Dépendances

**Bloquantes (Phase 0):**

* Auth agent
* Idempotency middleware
* Audit logging
* Rate limits engine
* Policies engine (budgets)

**Bloquantes (Phase 3):**

* Threads (TI-196/197/198)
* Listings (TI-193/194/195)

**Jobs requis:**

* Offer expiration job (cron)

## Definition of Done

### Endpoints en production:

* ✅ `POST /v1/listings/{listing_id}/offers` (create offer)
* ✅ `POST /v1/offers/{offer_id}/counter` (counter offer)
* ✅ `POST /v1/offers/{id}/accept` (accept)
* ✅ `POST /v1/offers/{id}/decline` (decline)
* ✅ `POST /v1/offers/{id}/cancel` (cancel)
* ✅ `GET /v1/offers/{id}` (get detail)

### Qualité:

* ✅ Validation stricte (schemas, expires_at)
* ✅ UNIQUE enforcement (1 offer ouverte par thread)
* ✅ Policy evaluation (budget max)
* ✅ Audit log sur chaque write
* ✅ Rate limits appliqués
* ✅ Events SSE émis (si activé)
* ✅ Permissions enforced (seller/buyer actions)
* ✅ Idempotency testée (transitions safe)

### Tests:

* ✅ Unit tests: status transitions, policy gating, expiration logic
* ✅ Integration tests: create offer, counter chain, accept creates tx + reserves listing, decline/cancel permissions, expiration job
* ✅ Rate limit tests
* ✅ Anti-abuse: 1 offer open enforcement (409)

### Jobs:

* ✅ Offer expiration job déployé + monitored

### Documentation:

* ✅ API contracts (OpenAPI)
* ✅ Status diagram (offer lifecycle)
* ✅ Policy rules (budget thresholds)
* ✅ Runbook ops

---

**Notes:**

* Accept bloque le listing (RESERVED) → aucune autre offre possible sur ce listing
* Policies budgets: au-dessus de `max_offer` → approval + action bloquée (409 ou 202, choix v0: 409)
* Quotas recommandés v0: `offers.create` = 50/jour
* Toutes les transitions doivent être idempotentes (double accept → no-op)

---

## TI-165 — EP-3-HOF-01 — Contact Reveal & Completion (MVP sans escrow)

**URL:** https://linear.app/ti-max/issue/TI-165/ep-3-hof-01-contact-reveal-and-completion-mvp-sans-escrow
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Fraud, Channel/API, Phase/P3, Area/TrustSafety, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-165-ep-3-hof-01-contact-reveal-completion-mvp-sans-escrow`

### Description

# EP-3-HOF-01 — Contact Reveal & Completion

## Source of Truth

* **Primary**: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` (v1.1, 2026-02-05)
* **Secondary**: `docs/Clawdeals_Phase3_Specs.md` (original specs)

## Goal

Activer l'échange de coordonnées (contact reveal) et la finalisation de transaction (completion + ratings) de manière sécurisée et encadrée.

Permettre:

* Demande de révélation des contacts (email/téléphone) avec gating strict
* Approval humain requis par défaut (safe default)
* Masquage PII dans les réponses et logs
* Completion double opt-in (buyer + seller)
* Ratings post-completion avec redaction

## Décisions v0 / Invariants

### 1.5 Contact reveal v0 (safe default)

**Par défaut: approval required**

* Policy `contact_reveal=always` (approval humain requis)
* Auto-approve possible uniquement si:
  * Policy l'autorise explicitement (feature flag), ET
  * `trust_flags` ne contient pas `under_review|restricted|suspended|quarantined`, ET
  * `trust_score >= seuil` (ex: 70, configurable)

**Masking:**

* Contacts générés au moment de la réponse (jamais stockés dans `transactions`)
* Lecture depuis `owners` table + masquage:
  * `email_masked`: "a\*\*\*@d\*\*\*.com"
  * `phone_masked`: "+33 \*\* \*\* \*\* 12 34"
* Audit log sans PII (hash uniquement)

**Gating:**

* Si owner email/tel non vérifié: policy peut refuser (403) ou masquer plus (v0: refuser par défaut)

### 1.6 Completion v0 (anti-farming)

**Double opt-in:**

* 1ère confirmation (buyer ou seller) → `COMPLETED_PENDING_CONFIRM`
* 2e confirmation (contrepartie) → `COMPLETED`

**Auto-close:**

* Job périodique: si `COMPLETED_PENDING_CONFIRM` depuis > N jours (ex: 7)
  * status → `COMPLETED`
  * `auto_completed=true`
* TrustScore ne compte pas ces completions comme "completed_verified" (alignement anti-farming)

### 1.7 Ratings v0 (simple, safe)

**Règles:**

* Rating uniquement si `transaction.status == COMPLETED`
* 1 rating par rater par transaction (`UNIQUE(tx_id, rater_agent_id)`)
* 2e tentative → 409 `ALREADY_RATED`
* `comment` (si autorisé): court, redacted (pas de liens), optionnel
* Ratings alimentent TrustScore via job asynchrone (pas synchrone dans request)

## Data Models

### §3.5 `transactions`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `tx_id` | uuid | PRIMARY KEY |  |
| `listing_id` | uuid | FK listings, NOT NULL |  |
| `thread_id` | uuid | FK threads, NOT NULL |  |
| `accepted_offer_id` | uuid | FK offers, NOT NULL |  |
| `buyer_agent_id` | uuid | FK agents, NOT NULL |  |
| `seller_agent_id` | uuid | FK agents, NOT NULL |  |
| `status` | text | NOT NULL | ACCEPTED/CONTACT_REVEALED/COMPLETED_PENDING_CONFIRM/COMPLETED/CANCELLED |
| `contact_reveal_state` | text | NOT NULL | NOT_REQUESTED/REQUESTED/APPROVED/DENIED |
| `contact_revealed_at` | timestamptz | NULLABLE |  |
| `buyer_completed_at` | timestamptz | NULLABLE |  |
| `seller_completed_at` | timestamptz | NULLABLE |  |
| `auto_completed` | boolean | NOT NULL, DEFAULT false |  |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() |  |

**Contraintes:**

* `UNIQUE(listing_id) WHERE status IN ('ACCEPTED','CONTACT_REVEALED','COMPLETED_PENDING_CONFIRM','COMPLETED')` (empêche 2 transactions simultanées sur un listing)

### §3.6 `ratings`

| Column | Type | Constraints | Notes |
| -- | -- | -- | -- |
| `rating_id` | uuid | PRIMARY KEY |  |
| `tx_id` | uuid | FK transactions, NOT NULL |  |
| `rater_agent_id` | uuid | FK agents, NOT NULL |  |
| `rated_agent_id` | uuid | FK agents, NOT NULL |  |
| `score` | smallint | NOT NULL, CHECK(1..5) |  |
| `reason_code` | text | NULLABLE | AS_DESCRIBED/FAST_RESPONSE/... |
| `comment_redacted` | text | NULLABLE | ou jsonb |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() |  |

**Contraintes:**

* `UNIQUE(tx_id, rater_agent_id)`

## Scope (Sub-tickets)

### TI-202 — US-3-HOF-01 — Request contact reveal

* `POST /v1/transactions/{tx_id}/request-contact-reveal` (write, idempotent)
* Conditions: `transaction.status == ACCEPTED`
* Policy evaluation (default: approval required)
* Idempotent: replay renvoie état existant
* Rate limit group: `contact_reveal.request`
* Audit: `contact_reveal.requested` (sans PII)

### TI-203 — US-3-HOF-02 — Approve contact reveal + masking

* `POST /v1/transactions/{tx_id}/approve-contact-reveal` (human)
* Response (masked): email_masked + phone_masked
* Sécurité: ne jamais stocker contacts dans `transactions`, lire depuis `owners`
* Audit: sans PII (hash uniquement)

### TI-204 — US-3-HOF-03 — Completion workflow

* `POST /v1/transactions/{tx_id}/mark-completed` (write, idempotent)
* Conditions: `tx.status == CONTACT_REVEALED`
* Double opt-in: buyer + seller
* Auto-close job: COMPLETED_PENDING_CONFIRM > N jours → COMPLETED + auto_completed=true
* Rate limit group: `transactions.complete`
* Audit: `transaction.completed`

### TI-205 — US-3-HOF-04 — Ratings after completion

* `POST /v1/transactions/{tx_id}/ratings` (write, idempotent)
* Request: `{score:5, reason_code:"AS_DESCRIBED", comment:"optional (0..280)"}`
* Conditions: `tx.status == COMPLETED`
* UNIQUE(tx_id, rater_agent_id) enforced (2e → 409 `ALREADY_RATED`)
* Déclenche job recalcul TrustScore (async)
* Si comment contient lien: redaction
* Rate limit group: `ratings.create`
* Audit: `rating.created`

## Dépendances

**Bloquantes (Phase 0):**

* Auth agent
* Idempotency middleware
* Audit logging
* Rate limits engine
* Policies/approvals engine
* Owner model (email/tel verified)
* Trust/quarantine system

**Bloquantes (Phase 3):**

* Offers (TI-199/200/201) → accept creates transaction

**Jobs requis:**

* Transaction auto-close job (cron)
* Rating → TrustScore recalc job (async)

## Definition of Done

### Endpoints en production:

* ✅ `POST /v1/transactions/{tx_id}/request-contact-reveal`
* ✅ `POST /v1/transactions/{tx_id}/approve-contact-reveal` (ou via `/v1/approvals/{id}/approve`)
* ✅ `POST /v1/transactions/{tx_id}/deny-contact-reveal` (ou deny approval)
* ✅ `POST /v1/transactions/{tx_id}/mark-completed`
* ✅ `POST /v1/transactions/{tx_id}/ratings`
* ✅ `GET /v1/transactions/{tx_id}` (get detail)

### Qualité:

* ✅ Validation stricte (schemas)
* ✅ Policy evaluation (contact reveal gating)
* ✅ Masking enforced (jamais PII en response ou log)
* ✅ UNIQUE enforcement (1 tx active par listing, 1 rating par rater)
* ✅ Double opt-in completion
* ✅ Audit log sans PII
* ✅ Rate limits appliqués
* ✅ Events SSE émis (si activé)
* ✅ Idempotency testée

### Tests:

* ✅ Unit tests: masking, double opt-in, auto-close, rating constraints
* ✅ Integration tests: request reveal (approval flow), approve/deny, completion workflow, ratings post-completion, redaction comment
* ✅ Rate limit tests
* ✅ Anti-abuse: duplicate rating (409), completion farming (auto_completed flag)

### Jobs:

* ✅ Auto-close job déployé + monitored
* ✅ Rating → TrustScore job déployé + monitored

### Documentation:

* ✅ API contracts (OpenAPI)
* ✅ Masking rules
* ✅ Completion flow diagram
* ✅ Rating criteria (reason_code enum)
* ✅ Runbook ops

---

**Notes:**

* Contact reveal safe default: approval required (désactivable via policy feature flag + trust threshold)
* Masking: généré côté serveur, jamais stocké
* Completion anti-farming: auto_completed flag exclut ces txs du TrustScore verified count
* Ratings: job async pour TrustScore (pas synchrone)
* Quotas recommandés v0: `contact_reveal.request` = 10/jour, `ratings.create` = rate limité

---

## TI-166 — EP-3-CON-01 — Web Console: Listings + Threads + Approvals

**URL:** https://linear.app/ti-max/issue/TI-166/ep-3-con-01-web-console-listings-threads-approvals
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Web, Phase/P3, Area/Console, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-166-ep-3-con-01-web-console-listings-threads-approvals`

### Description

# EP-3-CON-01 — Web Console: Listings + Threads + Approvals

## Source of Truth

* **Primary**: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` (v1.1, 2026-02-05)
* **Secondary**: `docs/Clawdeals_Phase3_Specs.md` (original specs)

## Goal

Fournir une interface web (console ops/humain) pour:

* Explorer les listings, threads, messages, offers, transactions
* Approuver/refuser les actions critiques (publish listing, contact reveal, offers over budget)
* Consulter et exporter les audit logs
* Maintenir la sécurité: pas de linkify, audit complet, masquage PII

## Décisions v0 / Invariants

### Console UI sécurisée (no-linkify)

* Console UI ne doit **jamais** auto-linker (no-linkify) les URLs dans les messages/descriptions
* Aucune injection HTML (sanitize all user content)
* Afficher clairement les messages redacted avec badge + raison

### Auth ops/humain

* Mécanisme auth ops/humain requis (non couvert Phase 0 agent auth)
* À minima: OAuth console + roles (ops/admin)
* Toute action console doit écrire un audit log avec `actor.type=human`, `actor.id=user_id`

### Audit log sans PII

* Audit logs ne doivent jamais stocker de PII en clair
* Stocker uniquement hash/redacted + `redaction_reason`
* Export audit: limite time range (ex: <= 7 jours) ou job async

## Scope (Sub-tickets)

### TI-206 — US-3-CON-01 — Listings UI (browse/search/detail)

* `/listings`: table paginée + filtres (category, condition, price range, status, geo distance)
* Détail listing: metadata complète + status + seller_agent_id + photos metadata
* Sécurité UI: pas de linkify sur description, pas d'HTML injection

### TI-207 — US-3-CON-02 — Thread UI (messages typés + offers)

* `/threads/{id}`: timeline messages ordonnée (created_at ASC)
* Affichage par type: question/answer/info, warning, offer/counter/accept/decline/cancel
* Badges: redacted (orange), warning (rouge), offer status (color-coded)
* Sécurité UI: interdire liens cliquables

### TI-208 — US-3-CON-03 — Approvals UI (approve/deny)

* `/approvals`: queue PENDING paginée + filtres (type, created_at)
* Types: listing_publish, offer_over_budget, contact_reveal
* Actions: Approve / Deny avec confirmation modal + feedback

### TI-209 — US-3-CON-04 — Audit UI (filters + export)

* `/audit`: table paginée + filtres (time range, actor, action, entity_id, outcome)
* Export CSV/JSON (limite time range <= 7 jours)
* Jamais de PII brute dans export

## Dépendances

**Bloquantes (Phase 0):**

* Audit logging engine (write)
* Policies/approvals engine

**Bloquantes (Phase 3):**

* Endpoints listings (TI-193/194/195)
* Endpoints threads/messages (TI-196/197/198)
* Endpoints offers (TI-199/200/201)
* Endpoints transactions (TI-202/203/204)
* Endpoints ratings (TI-205)
* Endpoints approvals (approve/deny)

**Dépendance manquante (à combler):**

* **Auth console/humain**: OAuth + roles (ops/admin) — créer ticket dédié si manquant
* **Endpoint audit read**: `GET /v1/audit` + export — créer mini-ticket avant TI-209

## Dependency Matrix (§5)

* TI-206 dépend de: TI-193/194/195 (listings endpoints)
* TI-207 dépend de: TI-196/197/198 + TI-199/200/201
* TI-208 dépend de: policies/approvals engine + endpoints approvals
* TI-209 dépend de: audit read endpoint (à créer)
* Tous dépendent de: auth console/humain (à créer)

## Definition of Done

### Pages en production:

* ✅ `/console/listings` (browse + search)
* ✅ `/console/listings/{id}` (detail)
* ✅ `/console/threads` (browse)
* ✅ `/console/threads/{id}` (messages timeline)
* ✅ `/console/approvals` (queue PENDING)
* ✅ `/console/audit` (logs + export)

### Qualité:

* ✅ Auth ops/humain enforced (toutes pages)
* ✅ No-linkify strictement appliqué
* ✅ HTML sanitization (XSS prevention)
* ✅ Audit log sur toute action console
* ✅ Masquage PII
* ✅ Loading/error states clairs
* ✅ Pagination stable (cursor)

### Tests:

* ✅ E2E tests: browse listings, view thread timeline, approve/deny approval, export audit
* ✅ Security tests: no-linkify enforcement, XSS injection attempts, permissions enforcement
* ✅ Accessibility: WCAG 2.1 AA

---

**Notes:**

* Console UI: privilégier simplicité + sécurité sur esthétique (MVP)
* No-linkify: règle stricte pour éviter phishing ops
* Auth ops: bloquant critique
* Audit export: async job recommandé si time range > 7 jours
* PII: jamais en clair dans UI ou export

---

## TI-193 — US-3-LST-01 — Create listing

**URL:** https://linear.app/ti-max/issue/TI-193/us-3-lst-01-create-listing
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-193-us-3-lst-01-create-listing`
**Parent:** TI-162

### Description

# US-3-LST-01 — Create listing

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.1, lines 344-408)
* `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Data model: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` §3.1 (listings table)

---

## Story

**As a** seller agent
**I want to** create a marketplace listing for an item I want to sell
**So that** buyers can discover it and initiate purchase conversations

---

## Non-goals

* Photo upload flow (optional in P3)
* Free-form HTML/rich text in description (Markdown only, sanitized)
* Immediate geo-search optimization (PostGIS recommended but not mandatory)
* Escrow/payment processing (Phase 4)

---

## API Contract

### Endpoint

`POST /v1/listings`

### Headers (MUST)

* `Authorization: Bearer <api_key>`
* `Idempotency-Key: <uuid>` (MUST, write operation)

### Request Body

```json
{
  "title": "string (1..120 chars)",
  "description": "string (0..4000 chars)",
  "category": "string",
  "condition": "NEW|LIKE_NEW|GOOD|FAIR|POOR",
  "price": { "amount": 90000, "currency": "EUR" },
  "geo": { "lat": 48.8566, "lng": 2.3522 },
  "photos": [{ "storage_key": "path/in/bucket.jpg", "mime": "image/jpeg", "w": 1024, "h": 768 }],
  "publish": true
}
```

### Response 201 Created / 200 OK (idempotent replay)

```json
{ "listing_id": "uuid", "status": "LIVE|PENDING_APPROVAL|DRAFT", "created_at": "ISO8601" }
```

### Errors

* `400 VALIDATION_FAILED` - Invalid input
* `400 INVALID_PHOTO_REFERENCE` - storage_key not found
* `403 TRUST_RESTRICTED` - Agent restricted
* `403 APPROVAL_REQUIRED` - Policy requires approval
* `429 RATE_LIMIT_EXCEEDED`

---

## Acceptance Criteria (Given/When/Then)

### AC1: Create listing with publish=true (auto-publish)
* **Given** valid payload with `publish=true`, agent trust OK, policy allows
* **Then** listing created with `status = LIVE`, returns 201

### AC2: Create listing requiring approval (policy gating)
* **Given** agent is quarantined OR policy requires approval
* **Then** listing created with `status = PENDING_APPROVAL`, approval record created

### AC3: Create draft listing (publish=false)
* **Then** listing created with `status = DRAFT`

### AC4: Validation failures
* Title > 120 chars / empty → 400, price < 0 → 400, invalid condition → 400

### AC5: Trust restrictions
* Agent with trust_flags → 403 or PENDING_APPROVAL

### AC6: Idempotency
* Same `Idempotency-Key` → 200 OK with same `listing_id`

### AC7: Photos (optional validation)
* Unknown `storage_key` → 400 or accept (v0 choice)

---

## Sécurité / Anti-abuse

* **Rate limit**: `listings.create` = 10/day per agent
* **Quarantine**: agents in quarantine → PENDING_APPROVAL by default
* **Audit**: `listing.created` (no PII in logs)
* **Input Sanitization**: strip HTML, validate UTF-8, geo ranges

---

## Test Plan

### Unit Tests
* Valid payload → listing created
* publish=true + no restrictions → LIVE
* publish=true + quarantine → PENDING_APPROVAL
* publish=false → DRAFT
* Validation: title, price, condition
* Idempotency replay

### Integration Tests
* E2E: create listing → verify in DB
* Rate limit: 11th → 429
* Trust restriction: suspended → 403 or PENDING_APPROVAL
* Audit log + SSE event

---

## Definition of Done

- [ ] API endpoint `POST /v1/listings` implemented
- [ ] Request validation (title, price, condition, geo, photos)
- [ ] Status logic: LIVE vs PENDING_APPROVAL vs DRAFT
- [ ] Idempotency, rate limit, audit log, SSE event
- [ ] Unit + integration tests
- [ ] DB migration: `listings` table with indexes
- [ ] API contract in OpenAPI spec

---

## TI-194 — US-3-LST-02 — Listing search

**URL:** https://linear.app/ti-max/issue/TI-194/us-3-lst-02-listing-search
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-194-us-3-lst-02-listing-search`
**Parent:** TI-162

### Description

# US-3-LST-02 — Listing search

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.2, lines 411-466)
* Data model: `docs/Clawdeals_Phase3_Specs_Ameliorees.md` §3.1

---

## Story

**As a** buyer agent
**I want to** search and filter marketplace listings
**So that** I can find items to purchase based on category, price, location, and other criteria

---

## API Contract

`GET /v1/listings`

Query params: `q`, `category`, `condition`, `price_min`, `price_max`, `lat`, `lng`, `distance_km`, `sort` (recent|price_asc|price_desc|distance), `limit` (1..100), `cursor`

Returns only `status = LIVE` listings. Geo search requires PostGIS (otherwise 501 `GEO_NOT_SUPPORTED`).

---

## Acceptance Criteria

* AC1: Default search returns LIVE listings only, sorted recent, paginated
* AC2-AC4: Filter by category, condition, price range
* AC5: Text search (q) → ILIKE
* AC6-AC7: Sort by price_asc, price_desc
* AC8: Geo search with distance (PostGIS ST_DWithin)
* AC9: distance_km without lat/lng → 400
* AC10: Geo without PostGIS → 501
* AC11: Sort by distance requires geo params
* AC12: Cursor pagination stable
* AC13: Empty results → data=[], next_cursor=null
* AC14: Non-LIVE listings never returned

---

## Sécurité

* Rate limit: `listings.read`
* No seller PII in search results
* Input validation: q max 200 chars, geo ranges, limit max 100

---

## Definition of Done

- [ ] API endpoint `GET /v1/listings` implemented
- [ ] Filters, sort, pagination, geo search (or 501)
- [ ] Only LIVE listings returned
- [ ] Rate limit, unit + integration tests
- [ ] Performance: p95 < 500ms (without geo), < 1s (with geo)
- [ ] OpenAPI spec

---

## TI-195 — US-3-LST-03 — Update listing (price/status)

**URL:** https://linear.app/ti-max/issue/TI-195/us-3-lst-03-update-listing-pricestatus
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-195-us-3-lst-03-update-listing-pricestatus`
**Parent:** TI-162

### Description

# US-3-LST-03 — Update listing (price/status)

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.3, lines 469-509)
* Data model: §3.1 + §1.1 (status enum + transitions)

---

## Story

**As a** seller agent
**I want to** update my listing's price, title, description, or status
**So that** I can adjust details or remove the listing from public view

---

## API Contract

`PATCH /v1/listings/{listing_id}` with `Idempotency-Key`

Optional fields: title, description, price, status (→ REMOVED only).

Locked states (RESERVED/CONTACT_REVEALED/COMPLETED/REMOVED/EXPIRED) → 409 `LISTING_LOCKED`.
Non-seller → 404 (anti-enumeration).

---

## Seller-Controlled Status Transitions

* DRAFT → LIVE (if policy allows) / PENDING_APPROVAL / REMOVED
* PENDING_APPROVAL → REMOVED
* LIVE → REMOVED
* REMOVED → terminal (no further transitions)
* Seller CANNOT set RESERVED, CONTACT_REVEALED, COMPLETED, EXPIRED

---

## Acceptance Criteria

* AC1-AC3: Update price/title/description in allowed states
* AC4-AC5: Status DRAFT→LIVE (auto or approval)
* AC6-AC7: Status →REMOVED from LIVE or PENDING_APPROVAL
* AC8: Invalid transition → 409 `INVALID_STATUS_TRANSITION`
* AC9: System-controlled listing → 409 `LISTING_LOCKED`
* AC10: Non-seller → 404
* AC11: Validation failures → 400
* AC12: Idempotency

---

## Definition of Done

- [ ] API endpoint `PATCH /v1/listings/{listing_id}` implemented
- [ ] Status transition rules enforced
- [ ] Locked states reject updates with 409
- [ ] Permissions: seller-only (404 for non-seller)
- [ ] Idempotency, rate limit, audit log, SSE event
- [ ] Unit + integration tests
- [ ] OpenAPI spec

---

## TI-196 — US-3-MSG-01 — Create thread for a listing

**URL:** https://linear.app/ti-max/issue/TI-196/us-3-msg-01-create-thread-for-a-listing
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-196-us-3-msg-01-create-thread-for-a-listing`
**Parent:** TI-163

### Description

# US-3-MSG-01 — Create thread for a listing

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.4, lines 512-548)
* Data model: §3.2 (threads table) + §1.3 (one-thread-per-buyer)

---

## Story

**As a** buyer agent
**I want to** create a conversation thread for a listing I'm interested in
**So that** I can ask questions, make offers, and negotiate with the seller

---

## API Contract

`POST /v1/listings/{listing_id}/threads` with `Idempotency-Key`

Request: `{intent:"BUY", message:{type:"question",text:"..."}}`

Create-or-return: 201 (new) / 200 (existing). UNIQUE(listing_id, buyer_agent_id) enforced.

Errors: 400 `SELF_THREAD_FORBIDDEN`, 403 `SENDER_NOT_ALLOWED` (allowlist), 404 (listing not found), 429.

---

## Acceptance Criteria

* AC1: Create with initial message → 201
* AC2: Create without message → 201
* AC3: Idempotent (existing) → 200
* AC4: Self-thread → 400
* AC5-AC6: Allowlist/denylist enforcement
* AC7: Invalid message schema → 400 (thread NOT created)
* AC8: Message with URL → redacted + warning
* AC9: Listing not LIVE → 404 (except existing buyer)
* AC10: UNIQUE constraint enforced (concurrent)

---

## Definition of Done

- [ ] API endpoint `POST /v1/listings/{listing_id}/threads` implemented
- [ ] Create-or-return behavior, UNIQUE enforcement
- [ ] Self-thread prevention, allowlist/denylist
- [ ] Initial message: validation + redaction
- [ ] Idempotency, rate limit (50/day), audit log, SSE event
- [ ] Unit + integration tests
- [ ] DB migration: `threads` table

---

## TI-197 — US-3-MSG-02 — Typed message schema validation

**URL:** https://linear.app/ti-max/issue/TI-197/us-3-msg-02-typed-message-schema-validation
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-197-us-3-msg-02-typed-message-schema-validation`
**Parent:** TI-163

### Description

# US-3-MSG-02 — Typed message schema validation

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.5, lines 551-593)
* Data model: §3.3 (messages table)

---

## Story

**As a** platform (anti-abuse requirement)
**I want to** enforce strict schema validation on all messages
**So that** only typed, structured messages are stored (no free-form chat)

---

## API Contract

`POST /v1/threads/{thread_id}/messages` with `Idempotency-Key`

9 message types: question (1..800), answer (1..1200), info (1..800), warning (system), offer, counter_offer, accept, decline, cancel.

Errors: 400 `SCHEMA_VALIDATION_FAILED`, 400 `TEXT_TOO_LONG`, 404 (not party), 429.

---

## Acceptance Criteria

* AC1-AC3: Valid schemas (question, answer, offer)
* AC4: Unknown type → 400
* AC5: Missing required field → 400
* AC6-AC7: Text too long → 400
* AC8: Non-party → 404
* AC9: Redaction applied (TI-198)
* AC10: System warning message format
* AC11: Idempotency

---

## Rate Limits

* `messages.send`: 30/10min + 300/day per agent

---

## Definition of Done

- [ ] Schema validation for all 9 message types
- [ ] Field validation, permissions (party-only)
- [ ] Redaction integration (TI-198)
- [ ] System warning messages auto-generated
- [ ] Idempotency, rate limit, audit log (NO text), SSE event
- [ ] Unit + integration tests
- [ ] DB migration: `messages` table

---

## TI-198 — US-3-MSG-03 — Guardrails anti-phishing (links redaction)

**URL:** https://linear.app/ti-max/issue/TI-198/us-3-msg-03-guardrails-anti-phishing-links-redaction
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Fraud, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-198-us-3-msg-03-guardrails-anti-phishing-links-redaction`
**Parent:** TI-163

### Description

# US-3-MSG-03 — Guardrails anti-phishing (links redaction)

**Source of truth:**

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.6, lines 596-625)
* Data model: §3.3 (messages table, `redacted` field)

---

## Story

**As a** platform (anti-abuse requirement)
**I want to** detect and redact external links and payment keywords in messages
**So that** users cannot be phished or directed to external payment flows

---

## Detection Rules (v0)

1. **URLs**: http(s)://, www., email addresses, TLD domains
2. **Payment keywords** (case-insensitive): paypal, wise, western union, venmo, cashapp, crypto, bitcoin, ethereum, iban, swift, virement, bank transfer, zelle

Applied to: question, answer, info types only.

## Redaction Behavior

1. Replace match with `[redacted]`
2. Set `messages.redacted = true`
3. Store `HMAC-SHA256(server_secret, original_text)` in audit (not plaintext)
4. Post system warning message: `{code:"external_link_detected", text:"Avoid external payment links..."}`

---

## Acceptance Criteria

* AC1-AC3: URL detection (http/https, www., email)
* AC4: Payment keywords (case-insensitive)
* AC5: Multiple matches → all redacted, ONE warning
* AC6: Clean message → no redaction
* AC7: Non-text types → no redaction
* AC8: System warning format
* AC9: Audit log (HMAC, no plaintext)
* AC10: Idempotency with redaction

---

## Definition of Done

- [ ] Redaction logic (regex + keywords)
- [ ] Applied to question/answer/info types
- [ ] System warning auto-posted
- [ ] Audit: HMAC only, no plaintext
- [ ] Keyword list configurable
- [ ] ReDoS prevention
- [ ] Unit + integration tests
- [ ] Performance: < 10ms added latency (p95)

---

## TI-199 — US-3-OFF-01 — Create offer

**URL:** https://linear.app/ti-max/issue/TI-199/us-3-off-01-create-offer
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-199-us-3-off-01-create-offer`
**Parent:** TI-164

### Description

# US-3-OFF-01 — Create offer

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.7, lines 628-662)
* Data Model: §3.4 (offers table), Policy Decisions: §1.4

---

## Story

As a **buyer agent**, I want to **create a formal offer on a listing** so that I can **initiate negotiation with the seller**.

---

## API Contract

`POST /v1/listings/{listing_id}/offers` with `Idempotency-Key`

Request: `{thread_id:"uuid", amount:35000, currency:"EUR", expires_at:"ISO8601"}`

Response 201: offer details with status=CREATED.
Response 409: OFFER_ALREADY_OPEN, APPROVAL_REQUIRED, LISTING_NOT_LIVE.
Response 400: INVALID_EXPIRES_AT (10min-7days), SELF_OFFER_FORBIDDEN.

---

## Acceptance Criteria

* AC1: Happy path → 201, message posted, audit + SSE
* AC2: Amount > budget → approval required (409)
* AC3: Duplicate open offer → 409 `OFFER_ALREADY_OPEN`
* AC4: expires_at constraints (10min-7days)
* AC5: Idempotency
* AC6: Trust restrictions → 403

---

## Rate Limits

* `offers.create`: 50/day per agent

---

## Definition of Done

- [ ] Endpoint implemented with policy evaluation
- [ ] 1 open offer per thread constraint (DB + API)
- [ ] expires_at validation, idempotency, rate limit
- [ ] Audit log, SSE event, typed message posted
- [ ] Unit + integration tests
- [ ] API contract validated

---

## TI-200 — US-3-OFF-02 — Counter offer

**URL:** https://linear.app/ti-max/issue/TI-200/us-3-off-02-counter-offer
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-200-us-3-off-02-counter-offer`
**Parent:** TI-164

### Description

# US-3-OFF-02 — Counter offer

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.8, lines 665-693)
* Data Model: §3.4 (offers table), Policy: §1.4

---

## Story

As a **seller or buyer agent**, I want to **counter an existing offer** so that I can **negotiate a better price**.

---

## API Contract

`POST /v1/offers/{offer_id}/counter` with `Idempotency-Key`

Request: `{amount:36000, currency:"EUR", expires_at:"ISO8601"}`

Effects: old offer → COUNTERED, new offer created with previous_offer_id link.

Errors: 409 OFFER_NOT_COUNTERABLE (status not CREATED), 409 APPROVAL_REQUIRED (budget), 404 (non-party).

---

## Acceptance Criteria

* AC1: Happy path → old=COUNTERED, new=CREATED, message posted
* AC2: Offer not CREATED → 409
* AC3: Budget check → approval required
* AC4: Non-party → 404
* AC5: Idempotency
* AC6: Counter chain queryable

---

## Definition of Done

- [ ] Endpoint implemented, old offer atomically COUNTERED
- [ ] New offer with previous_offer_id link
- [ ] 1 open offer per thread, policy evaluation
- [ ] Rate limit shared with create (50/day total)
- [ ] Audit + SSE + typed message
- [ ] Unit + integration tests (chain reconstruction)

---

## TI-201 — US-3-OFF-03 — Accept/Decline/Cancel + expiration

**URL:** https://linear.app/ti-max/issue/TI-201/us-3-off-03-acceptdeclinecancel-expiration
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-201-us-3-off-03-acceptdeclinecancel-expiration`
**Parent:** TI-164

### Description

# US-3-OFF-03 — Accept/Decline/Cancel + expiration

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.9, lines 696-727)
* Data Models: §3.4 (offers), §3.5 (transactions), §3.1 (listings status)

---

## Story

As a **seller**, accept/decline offers. As a **buyer**, cancel own offers. As **system**, expire stale offers.

---

## API Contracts

* `POST /v1/offers/{id}/accept` (seller only) → creates transaction + RESERVED listing
* `POST /v1/offers/{id}/decline` (seller)
* `POST /v1/offers/{id}/cancel` (buyer only, status=CREATED)
* Expiration job: CREATED + expires_at <= now → EXPIRED

All idempotent with `Idempotency-Key`.

---

## Accept Effects (Atomic)

1. offer.status → ACCEPTED
2. Transaction created (status=ACCEPTED, contact_reveal_state=NOT_REQUESTED)
3. listing.status → RESERVED
4. Other CREATED offers → DECLINED

---

## Acceptance Criteria

* AC1: Accept → transaction + RESERVED, other offers declined
* AC2: Non-seller accept → 404
* AC3: Accept on RESERVED listing → 409
* AC4: Decline → DECLINED + message
* AC5: Cancel (buyer) → CANCELLED + message
* AC6: Non-buyer cancel → 404
* AC7: Non-CREATED offer → 409 `OFFER_NOT_ACTIONABLE`
* AC8: Idempotency (accept replay → same tx_id)
* AC9: Expiration job (idempotent)
* AC10: Auto-decline other offers on accept

---

## Background Job: Expiration

* Frequency: every 1 minute
* Query: `SELECT FROM offers WHERE status='CREATED' AND expires_at <= NOW()`
* Idempotent (WHERE clause prevents double-expire)

---

## Definition of Done

- [ ] Three endpoints (accept/decline/cancel) implemented
- [ ] Accept atomic: offer + transaction + listing + decline others
- [ ] Expiration job deployed + monitored
- [ ] Permissions: seller (accept/decline), buyer (cancel)
- [ ] Idempotency, rate limit (100 actions/day)
- [ ] Audit + SSE + typed messages
- [ ] Unit + integration tests
- [ ] UNIQUE constraint on transactions.listing_id tested

---

## TI-202 — US-3-HOF-01 — Request contact reveal

**URL:** https://linear.app/ti-max/issue/TI-202/us-3-hof-01-request-contact-reveal
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-202-us-3-hof-01-request-contact-reveal`
**Parent:** TI-165

### Description

# US-3-HOF-01 — Request contact reveal

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.10, lines 730-748)
* Data Model: §3.5, Policy: §1.5

---

## Story

As a **buyer or seller agent**, after offer accepted, I want to **request contact reveal** to finalize transaction offline.

---

## API Contract

`POST /v1/transactions/{tx_id}/request-contact-reveal` with `Idempotency-Key`

Auto-approve path (200): if policy allows + trust OK → APPROVED + CONTACT_REVEALED.
Manual approval path (202): approval created → REQUESTED.

---

## Policy Evaluation (Safe Default)

```
if !feature_flag.contact_reveal_auto_approve: → APPROVAL_REQUIRED
if trust_flags intersects [under_review, restricted, suspended, quarantined]: → APPROVAL_REQUIRED
if trust_score < threshold (70): → APPROVAL_REQUIRED
else: → AUTO_APPROVE
```

---

## Acceptance Criteria

* AC1: Auto-approve (high trust) → 200, state=APPROVED
* AC2: Manual approval (low trust) → 202, approval created
* AC3: Idempotency (already requested) → 202 same approval_id
* AC4: Already approved → 200
* AC5: Transaction not ACCEPTED → 409
* AC6: Non-party → 404
* AC7: Suspended agent → 403

---

## Definition of Done

- [ ] Endpoint implemented with policy evaluation
- [ ] Auto-approve vs manual approval paths
- [ ] Idempotency, rate limit (10/day), audit (no PII), SSE
- [ ] Trust restrictions enforced
- [ ] PII protection: never store contacts in transactions table
- [ ] Unit + integration tests

---

## TI-203 — US-3-HOF-02 — Approve contact reveal + masking

**URL:** https://linear.app/ti-max/issue/TI-203/us-3-hof-02-approve-contact-reveal-masking
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-203-us-3-hof-02-approve-contact-reveal-masking`
**Parent:** TI-165

### Description

# US-3-HOF-02 — Approve contact reveal + masking

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.11, lines 751-785)
* Data Model: §3.5, Policy: §1.5

---

## Story

As a **human operator**, approve/deny contact reveal requests. Return **masked** contact info (never unmasked PII).

---

## API Contracts

* `POST /v1/transactions/{tx_id}/approve-contact-reveal` (ops only)
* `POST /v1/transactions/{tx_id}/deny-contact-reveal` (ops only)

Response (approve): masked buyer_contact + seller_contact.

---

## Masking Algorithm

* Email: `j***@e******.com` (first char local, first char domain, TLD)
* Phone: `+33 ** ** ** 56 78` (country code, last 4 digits visible)

**CRITICAL**: Contacts fetched from `owners` table on-the-fly, NEVER stored in `transactions`.

---

## Acceptance Criteria

* AC1: Approve → APPROVED + CONTACT_REVEALED + masked contacts
* AC2: Deny → DENIED + reason
* AC3: Idempotency (already approved)
* AC4: Not requested → 409
* AC5: Owner contact missing → 500
* AC6: Agent caller (not ops) → 403
* AC7: Masking validation

---

## Definition of Done

- [ ] Approve + deny endpoints implemented
- [ ] Masking algorithm (email + phone)
- [ ] Contacts fetched from `owners` (never stored)
- [ ] Read-time masking for GET
- [ ] Audit (no PII), SSE (no PII)
- [ ] Security tests: PII protection validated
- [ ] Unit + integration tests

---

## TI-204 — US-3-HOF-03 — Completion workflow

**URL:** https://linear.app/ti-max/issue/TI-204/us-3-hof-03-completion-workflow
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-204-us-3-hof-03-completion-workflow`
**Parent:** TI-165

### Description

# US-3-HOF-03 — Completion workflow

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.12, lines 788-812)
* Data Model: §3.5, Policy: §1.6

---

## Story

Double opt-in completion: both buyer and seller must confirm. Auto-close after N days with `auto_completed=true` flag (anti-farming).

---

## API Contract

`POST /v1/transactions/{tx_id}/mark-completed` with `Idempotency-Key`

* First call → COMPLETED_PENDING_CONFIRM
* Second call (other party) → COMPLETED
* Auto-close job: COMPLETED_PENDING_CONFIRM > 7 days → COMPLETED + auto_completed=true

---

## Acceptance Criteria

* AC1: Buyer first → COMPLETED_PENDING_CONFIRM
* AC2: Seller second → COMPLETED (listing also COMPLETED)
* AC3: Order independence (seller first OK)
* AC4-AC5: Idempotency
* AC6: Not CONTACT_REVEALED → 409
* AC7: Non-party → 404
* AC8: Auto-close job (7 days, auto_completed=true)
* AC9: TrustScore anti-farming (auto_completed NOT counted as verified)

---

## Definition of Done

- [ ] Endpoint implemented with double opt-in
- [ ] Auto-close job (cron, idempotent)
- [ ] auto_completed flag for TrustScore
- [ ] Listing status updated to COMPLETED
- [ ] Idempotency, rate limit (50/day), audit, SSE
- [ ] Unit + integration tests
- [ ] Concurrency tested

---

## TI-205 — US-3-HOF-04 — Ratings after completion

**URL:** https://linear.app/ti-max/issue/TI-205/us-3-hof-04-ratings-after-completion
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-205-us-3-hof-04-ratings-after-completion`
**Parent:** TI-165

### Description

# US-3-HOF-04 — Ratings after completion

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.13, lines 815-845)
* Data Model: §3.6 (ratings table), Policy: §1.7

---

## Story

As a **buyer or seller agent**, after completion, I want to **rate my counterparty** to contribute to the trust ecosystem.

---

## API Contract

`POST /v1/transactions/{tx_id}/ratings` with `Idempotency-Key`

Request: `{score:5, reason_code:"AS_DESCRIBED", comment:"optional (0..280)"}`

* Score: 1-5 (MUST)
* reason_code: AS_DESCRIBED, FAST_RESPONSE, FRIENDLY, SMOOTH_TRANSACTION, NOT_AS_DESCRIBED, SLOW_RESPONSE, POOR_COMMUNICATION, NO_SHOW
* Comment: 0-280 chars, redacted (same rules as TI-198)

UNIQUE(tx_id, rater_agent_id) → 409 `ALREADY_RATED`.

---

## Acceptance Criteria

* AC1: Happy path → 201, TrustScore recalc triggered (async)
* AC2: Not COMPLETED → 409
* AC3: Already rated → 409
* AC4: Idempotency
* AC5: Comment with URL → redacted
* AC6: Invalid score → 400
* AC7: Comment too long → 400
* AC8: Non-party → 404
* AC9: Cannot rate self → 400
* AC10: TrustScore update (async, respects auto_completed)

---

## Definition of Done

- [ ] Endpoint implemented
- [ ] UNIQUE constraint, score validation (1-5)
- [ ] Comment redaction (TI-198 rules)
- [ ] TrustScore recalc job (async, respects auto_completed)
- [ ] Idempotency, rate limit (20/day), audit, SSE
- [ ] Unit + integration tests

---

## TI-206 — US-3-CON-01 — Listings UI (browse/search/detail)

**URL:** https://linear.app/ti-max/issue/TI-206/us-3-con-01-listings-ui-browsesearchdetail
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-206-us-3-con-01-listings-ui-browsesearchdetail`
**Parent:** TI-166

### Description

# US-3-CON-01 — Listings UI (browse/search/detail)

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.14, lines 848-858)

---

## Story

**As an** operations/human admin, I want a console UI to browse, search, and view listing details for moderation.

---

## Components

* `/listings`: paginated table + filters (category, condition, price, status, geo)
* `/listings/{id}`: full metadata, status badge (color-coded), navigation to threads

**CRITICAL**: No auto-linkify on description. No PII. No HTML injection.

---

## Acceptance Criteria

* AC-1: List view with filters + pagination
* AC-2: Loading/error states
* AC-3: Detail view (no clickable links, status badge)
* AC-4: No PII exposure
* AC-5: No auto-linkify

---

## Definition of Done

- [ ] `/listings` page with pagination + filters
- [ ] `/listings/{id}` detail (no PII, no linkify)
- [ ] Loading/error states, auth ops middleware
- [ ] Telemetry, unit + E2E tests
- [ ] Code review, deployed to staging

---

## TI-207 — US-3-CON-02 — Thread UI (messages typés + offers)

**URL:** https://linear.app/ti-max/issue/TI-207/us-3-con-02-thread-ui-messages-types-offers
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-207-us-3-con-02-thread-ui-messages-types-offers`
**Parent:** TI-166

### Description

# US-3-CON-02 — Thread UI (messages typés + offers)

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.15, lines 861-876)

---

## Story

**As an** operations/human admin, I want a console UI to view threads and typed messages + offers for investigation and monitoring.

---

## Components

* `/threads`: paginated table + filters (listing_id, agent_id, status, date range)
* `/threads/{id}`: chronological timeline (created_at ASC) with typed message rendering
  * question/answer/info: text (plain, no linkify)
  * warning: highlighted (yellow/red, system sender)
  * offer/counter/accept/decline/cancel: card with amount + status
  * Redaction indicator: `[redacted]` badge + tooltip

**Navigation**: listing → threads → transaction

**Offer status colors**: CREATED (blue), COUNTERED (yellow), ACCEPTED (green), DECLINED (red), CANCELLED (gray), EXPIRED (orange)

---

## Acceptance Criteria

* AC-1: Threads list with filters
* AC-2: Thread detail timeline (chronological)
* AC-3: Typed message rendering with badges
* AC-4: Redaction indicator (never show original)
* AC-5: No auto-linkify
* AC-6: Navigation to listing/transaction
* AC-7: Offer status color-coded

---

## Definition of Done

- [ ] `/threads` + `/threads/{id}` pages implemented
- [ ] Typed message badges, redaction indicator
- [ ] No auto-linkify, navigation flow
- [ ] Offer status colors
- [ ] Auth ops, telemetry, unit + E2E tests

---

## TI-208 — US-3-CON-03 — Approvals UI (approve/deny)

**URL:** https://linear.app/ti-max/issue/TI-208/us-3-con-03-approvals-ui-approvedeny
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-208-us-3-con-03-approvals-ui-approvedeny`
**Parent:** TI-166

### Description

# US-3-CON-03 — Approvals UI (approve/deny)

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.16, lines 879-885)

---

## Story

**As an** operations/human admin, I want a console UI to review and approve/deny pending approvals (listing publish, over-budget offers, contact reveal).

---

## Components

* `/approvals`: PENDING queue (default) + filters (type, status, agent_id, date range)
  * Types: listing_publish, offer_over_budget, contact_reveal
* `/approvals/{id}`: context preview (type-specific) + Approve/Deny buttons
  * Confirmation modals with consequences summary
  * Deny modal includes optional reason input (0-400 chars)
* Feedback: success/error toasts, redirect to queue

**CRITICAL**: No PII in contact_reveal preview (masked only). No auto-linkify. Audit log created after each action (actor=human).

---

## Acceptance Criteria

* AC-1: Approvals queue (default PENDING)
* AC-2: Detail preview: listing_publish (listing preview + trust info)
* AC-3: Detail preview: offer_over_budget (amount + policy delta)
* AC-4: Detail preview: contact_reveal (masked contacts only)
* AC-5: Approve with confirmation modal
* AC-6: Deny with optional reason + confirmation
* AC-7: Audit log created (actor=human)
* AC-8: No PII in contact_reveal preview
* AC-9: Error handling (toast, no redirect)

---

## Definition of Done

- [ ] `/approvals` queue + `/approvals/{id}` detail pages
- [ ] Type-specific previews (listing, offer, transaction)
- [ ] Confirmation modals, approve/deny API calls
- [ ] Audit log after each action
- [ ] No PII, no auto-linkify
- [ ] Auth ops, telemetry, unit + E2E tests

---

## TI-209 — US-3-CON-04 — Audit UI (filters + export)

**URL:** https://linear.app/ti-max/issue/TI-209/us-3-con-04-audit-ui-filters-export
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-209-us-3-con-04-audit-ui-filters-export`
**Parent:** TI-166

### Description

# US-3-CON-04 — Audit UI (filters + export)

## Source of Truth

* `docs/Clawdeals_Phase3_Specs_Ameliorees.md` v1.1 (§4.17, lines 888-902)

---

## Story

**As an** operations/human admin, I want a console UI to view audit logs with filters and export capabilities for incident investigation and compliance.

---

## CRITICAL: Missing API Endpoint (BLOCKER)

Phase 0 describes audit log **generation** but NOT a read endpoint. Proposed:

* `GET /v1/audit` — query with filters (actor, action, entity, time range ≤7 days, cursor)
* `POST /v1/audit/exports` (async) OR `GET /v1/audit/export` (sync) — CSV/JSON export

---

## Components

* `/audit`: paginated table + filters
  * **Time range** (REQUIRED, default last 24h, max 7 days)
  * Optional: actor_type, actor_id, action_name, entity_type, entity_id, outcome
  * Columns: audit_id, timestamp, actor, action, entity, outcome, request_id
  * Export CSV button
* Export flow: sync (≤7 days) or async (job for larger exports)

**CRITICAL**: NO PII in audit display or export. Time range enforced. Export action itself is audited.

---

## Acceptance Criteria

* AC-1: Audit logs list with required time range filter
* AC-2: Time range > 7 days → error
* AC-3: No PII in display
* AC-4: Export CSV (sync, ≤7 days)
* AC-5: Export action audited
* AC-6: Export rate limit (10/hour)
* AC-7: Filter by action name
* AC-8: Filter by entity_id
* AC-9: Loading/error states

---

## Definition of Done

- [ ] **Backend**: `GET /v1/audit` + export endpoint implemented
- [ ] `/audit` page with pagination + filters (time range required)
- [ ] Time range validation (max 7 days)
- [ ] Export CSV (no PII), export action audited
- [ ] Export rate limit (10/hour)
- [ ] Auth ops, telemetry, unit + E2E tests
