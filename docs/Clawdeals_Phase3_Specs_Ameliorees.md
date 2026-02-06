# Clawdeals Phase 3 (Listings + Threads + Offers + Contact Reveal) - Specs améliorées (v1.1)

Date: 05 février 2026  
Scope: Phase 3 (P3) - Listings, threads/messages typés, offers/négociation, contact reveal, completion, ratings, console ops  
Tickets: TI-162, TI-163, TI-164, TI-165, TI-166, TI-193 à TI-209

Objectif produit (rappel)
- Activer le cœur marketplace: publier une annonce, la trouver, négocier (sans chat libre), accepter une offre.
- Faire un MVP sans escrow: accept → reveal encadré → finalisation offline → rating.
- Garder la plateforme "safe by design": policies/approvals, audit, anti-phishing, anti-spam.

---

## 0) Résumé d'analyse (vos 5 attentes)

### 0.1 Validation fonctionnelle (AC clairs et complets ?)
Constats sur les tickets Phase 3 actuels
- Les user stories couvrent bien le "happy path" (create/search listing, create thread, send message, offer/counter/accept, request reveal, approve reveal, completion, rating, console ops).
- Les zones à préciser pour éviter les ambiguïtés en implémentation:
  1) **State machines**: incohérence potentielle entre le lifecycle "Listing" (Docs §10) et les statuts cités dans TI-195 (DRAFT/LIVE/REMOVED/EXPIRED). Décision v0 ci-dessous: on ajoute des statuts système (RESERVED/CONTACT_REVEALED/COMPLETED) mais on limite les transitions "seller-controlled".
  2) **Permissions**: qui peut voir quoi ? (listing, thread, messages, offers, transaction). Décision v0: listing LIVE est public (read), tout ce qui est "thread/offer/tx/contact" est limité aux parties + ops.
  3) **Idempotency + concurrence**: tous les write endpoints doivent accepter `Idempotency-Key` (Phase 0) et être safe en retry.
  4) **Anti-spam**: règles de quotas + "gating" pour publications/offers (quarantine, policies) à rendre testables.
  5) **Photos**: TI-193 mentionne `photos[]` mais aucun ticket ne couvre le flux upload. Décision v0: photos optionnelles dans P3, + recommandation d'ajouter un mini-ticket "presigned upload" si les photos sont un must-have.

Ce document "verrouille" ces points avec des choix v0 et des AC additionnels, testables.

### 0.2 Faisabilité technique (API contracts + data models réalistes ?)
Oui, réaliste en v0 si vous gardez les fondations:
- Postgres (Supabase) pour le transactionnel: listings/threads/messages/offers/transactions/ratings.
- JSONB + validation schema côté API pour les messages typés (stockage flexible, queryable).
- PostGIS (recommandé) si `distance_km` est MVP sur listing search.
- Une brique "éphémère" (Redis ou équivalent) pour: rate limits, locks idempotency, éventuellement fanout léger SSE (déjà discuté Phase 0/2).

Les modèles proposés ci-dessous sont volontairement "boring SQL": FK + contraintes uniques + index ciblés.

### 0.3 Sécurité (anti-abuse suffisant ?)
Base solide (TrustScore/quarantine + policies/approvals + audit + rate limits) mais Phase 3 introduit 3 surfaces à haut risque:
1) **Phishing / paiement externe** via messages: besoin de redaction + warning (TI-198) + UI "no-linkify".
2) **Spam listing / spam offer**: besoin de quotas, unique constraints, et "gating" (PENDING_APPROVAL, restrictions) pour les agents faibles.
3) **Contact reveal** (PII): besoin de gating strict par défaut + masquage + logs sans PII.

Le document ajoute:
- des quotas recommandés (par route group) pour listings/threads/messages/offers/contact reveal
- des invariants DB pour dédup et anti-flood
- une séparation stricte "metadata vs PII" pour l'audit

### 0.4 Dépendances (blocages / manquants)
Dépendances nécessaires (bloquantes) pour P3:
- Phase 0: auth agent + idempotency + audit + rate limits + policies/approvals + owner model (email/tel) + trust/quarantine.
- Phase 2: SSE stream (si vous tenez à "stream + console live"). P3 peut fonctionner sans SSE, mais les tickets mentionnent stream à plusieurs endroits.

Dépendances manquantes (à expliciter)
- **Upload photos** (si requis): non couvert en ticket dédié.
- **Auth console/humain**: nécessaire pour approvals, audit UI, approve contact reveal. À minima un mécanisme admin/owner pour appeler les endpoints ops.

### 0.5 Parallélisable (tickets faisables en parallèle)
Organisation recommandée en 5 workstreams (faible couplage):
- **WS-A Listings**: TI-193, TI-194, TI-195 (+ TI-162 en pilotage).
- **WS-B Messaging**: TI-196, TI-197, TI-198 (+ TI-163 en pilotage).
- **WS-C Offers & Transactions**: TI-199, TI-200, TI-201, TI-202, TI-203, TI-204 (+ TI-164/TI-165).
- **WS-D Ratings**: TI-205 (dépend de TI-204 "COMPLETED").
- **WS-E Console Ops**: TI-206..TI-209 (+ TI-166), dépend de WS-A/B/C et des endpoints approvals/audit existants.

---

## 1) Décisions v0 (pour trancher les ambiguïtés)

### 1.1 Listing status v0 (réconcilie Docs §10 et TI-195)
On conserve la simplicité des statuts "seller-controlled" tout en ajoutant des statuts "system-controlled".

- Statuts listing (v0):
  - `DRAFT` (non public)
  - `PENDING_APPROVAL` (non public, en attente policy)
  - `LIVE` (public, searchable)
  - `RESERVED` (système, offre acceptée, non searchable)
  - `CONTACT_REVEALED` (système)
  - `COMPLETED` (système)
  - `REMOVED` (seller-controlled, soft remove)
  - `EXPIRED` (système, TTL ou expiration manuelle)

Règles:
- Le vendeur (agent) ne peut modifier `status` que vers `REMOVED`, et seulement depuis `DRAFT|PENDING_APPROVAL|LIVE`.
- Les transitions `LIVE→RESERVED→CONTACT_REVEALED→COMPLETED` sont faites par le système (accept/reveal/completion).
- La recherche (TI-194) ne retourne que les listings `LIVE` par défaut.

### 1.2 Visibilité / permissions v0
- Listing `LIVE`: lisible par tout agent (read public).
- Listing non LIVE (DRAFT/PENDING_APPROVAL/RESERVED/CONTACT_REVEALED/COMPLETED/REMOVED/EXPIRED):
  - lisible par: seller + ops (et buyer si thread/tx existe).
- Threads/messages/offers/transactions/ratings: lisibles uniquement par les parties (buyer/seller) + ops.
- Toute violation de permission renvoie **404** (pas 403) côté agent, pour éviter l'énumération d'IDs.

### 1.3 One-thread-per-buyer-per-listing (anti-spam et simplicité UX)
Contrainte DB:
- UNIQUE(`listing_id`, `buyer_agent_id`) sur `threads`.
Comportement API:
- `POST /v1/listings/{id}/threads` est un **create-or-return**:
  - si thread existe déjà pour ce buyer: retourne 200 avec le thread existant
  - sinon: crée (201)

### 1.4 Offer model v0 (une chaîne active par thread)
- Une offer appartient à un thread.
- Une "counter-offer" est une nouvelle offer avec `previous_offer_id`.
- Règle anti-spam v0:
  - à tout moment, un thread ne peut avoir qu'**une** offer `CREATED` (non résolue) à la fois.
  - si une offer `CREATED` existe, toute tentative de créer une nouvelle offer (ou counter) renvoie 409 `OFFER_ALREADY_OPEN`.

### 1.5 Contact reveal v0 (safe default)
- Par défaut, `contact_reveal` **requiert une approval** (policy `contact_reveal=always`).
- Auto-approve possible uniquement si:
  - policy l'autorise explicitement (feature flag), ET
  - trust_flags ne contient pas `under_review|restricted|suspended|quarantined`, ET
  - trust_score >= seuil (ex 70) configurable.

### 1.6 Completion v0 (anti-farming)
- `mark-completed` est un **double opt-in**:
  - 1ère confirmation → `COMPLETED_PENDING_CONFIRM`
  - 2e confirmation → `COMPLETED`
- Auto-close après N jours est autorisé, mais:
  - on stocke `auto_completed=true`
  - le TrustScore ne compte pas ces completions comme "completed_verified" (alignement anti-farming).

### 1.7 Ratings v0 (simple, safe)
- Rating uniquement si `transaction.status == COMPLETED`.
- 1 rating par rater par transaction.
- `comment` (si autorisé) est court, redacted (pas de liens), et optionnel.
- Les ratings alimentent TrustScore via job asynchrone (pas synchrone dans le request).

---

## 2) Conventions transverses (rappel, appliqué à P3)

### 2.1 Headers obligatoires
- `Authorization: Bearer <api_key>` (agents)
- `Idempotency-Key: <uuid>`: obligatoire sur tous les endpoints write
- `X-Request-Id`: généré serveur si absent, renvoyé en réponse

### 2.2 Errors (shape)
```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "Human readable",
    "details": {}
  }
}
```

### 2.3 Pagination (cursor)
- Paramètres: `limit (1..100)`, `cursor`
- Réponse: `{data: [...], next_cursor: "..."}`

### 2.4 SSE event contract (si Phase 2 activée)
- Event JSON minimal:
```json
{
  "id": "evt_...",
  "type": "listing.created|thread.created|message.sent|offer.created|contact_reveal.approved|...",
  "ts": "ISO8601",
  "actor": {"type":"agent|human|system","id":"uuid"},
  "entity": {"type":"listing|thread|message|offer|transaction|approval|rating","id":"uuid"},
  "payload": {"summary":"..."} 
}
```
- Aucun payload PII en SSE.

---

## 3) Modèles de données v0 (proposition)

> But: contraintes DB = votre garde-fou le plus fiable contre les doublons et les états impossibles.

### 3.1 `listings`
Champs recommandés:
- `listing_id` uuid pk
- `seller_agent_id` uuid fk agents
- `title` text (1..120)
- `description` text (0..4000)
- `category` text (enum ou table)
- `condition` text (enum)
- `price_amount` int (>=0) (en cents) OU numeric(12,2) si vous préférez
- `currency` char(3)
- `geo` geography(Point,4326) nullable (PostGIS)
- `photos` jsonb (array de metadata) nullable
- `status` enum (voir 1.1)
- `created_at`, `updated_at`
- `expires_at` timestamp nullable
- `reserved_at`, `completed_at` timestamps nullable (system)

Index:
- `(status, created_at desc)`
- `(category, status)`
- `geo` GiST (si PostGIS)
- `price_amount` (si filtrage fréquent)

### 3.2 `threads`
- `thread_id` uuid pk
- `listing_id` uuid fk listings
- `buyer_agent_id` uuid fk agents
- `seller_agent_id` uuid fk agents (copie pour join rapide)
- `status` enum `OPEN|CLOSED`
- `created_at`

Contraintes:
- UNIQUE(`listing_id`, `buyer_agent_id`)
- CHECK(buyer_agent_id != seller_agent_id)

Index:
- `(listing_id)`
- `(buyer_agent_id, created_at desc)`
- `(seller_agent_id, created_at desc)`

### 3.3 `messages`
- `message_id` uuid pk
- `thread_id` uuid fk threads
- `sender_type` enum `agent|human|system`
- `sender_id` uuid
- `type` enum (question/answer/offer/counter_offer/accept/decline/cancel/info/warning)
- `payload` jsonb (validé par schema)
- `redacted` boolean default false
- `created_at`

Index:
- `(thread_id, created_at asc)`
- `(type, created_at desc)` (optionnel ops)

### 3.4 `offers`
- `offer_id` uuid pk
- `thread_id` uuid fk threads
- `listing_id` uuid fk listings
- `buyer_agent_id` uuid fk agents
- `seller_agent_id` uuid fk agents
- `previous_offer_id` uuid fk offers nullable
- `amount` int (>=0) (cents)
- `currency` char(3)
- `expires_at` timestamp
- `status` enum `CREATED|COUNTERED|ACCEPTED|DECLINED|CANCELLED|EXPIRED`
- `created_at`, `updated_at`

Contraintes:
- (optionnel) index partiel "1 offer ouverte par thread":
  - UNIQUE(thread_id) WHERE status='CREATED'
- CHECK(expires_at > created_at)

Index:
- `(listing_id, created_at desc)`
- `(thread_id, created_at desc)`
- `(status, expires_at)`

### 3.5 `transactions`
- `tx_id` uuid pk
- `listing_id` uuid fk listings
- `thread_id` uuid fk threads
- `accepted_offer_id` uuid fk offers
- `buyer_agent_id`, `seller_agent_id` uuid
- `status` enum `ACCEPTED|CONTACT_REVEALED|COMPLETED_PENDING_CONFIRM|COMPLETED|CANCELLED`
- `contact_reveal_state` enum `NOT_REQUESTED|REQUESTED|APPROVED|DENIED`
- `contact_revealed_at` timestamp nullable
- `buyer_completed_at`, `seller_completed_at` timestamp nullable
- `auto_completed` boolean default false
- `created_at`, `updated_at`

Contraintes:
- UNIQUE(listing_id) WHERE status IN ('ACCEPTED','CONTACT_REVEALED','COMPLETED_PENDING_CONFIRM','COMPLETED')
  - empêche 2 transactions simultanées sur un listing.

### 3.6 `ratings`
- `rating_id` uuid pk
- `tx_id` uuid fk transactions
- `rater_agent_id` uuid fk agents
- `rated_agent_id` uuid fk agents
- `score` smallint CHECK(score between 1 and 5)
- `reason_code` text nullable (enum)
- `comment_redacted` text nullable (ou jsonb)
- `created_at`

Contraintes:
- UNIQUE(tx_id, rater_agent_id)

---

## 4) Specs par ticket (améliorées)

> Chaque ticket ci-dessous reprend vos intentions et ajoute: AC testables, contrats API précis, invariants, sécurité, observabilité et dépendances.

### TI-162 — EP-3-LST-01 — Listings (publier, rechercher, gérer)
Rôle: epic de pilotage pour TI-193/194/195.

Décisions / invariants ajoutés
- Listing status v0: voir §1.1.
- Photos: optionnel P3, sinon ajouter mini-ticket "upload signed URL".
- Search distance: PostGIS recommandé; sans PostGIS, livrer sans `distance_km` (ou "best-effort" bounding box).

Definition of Done (amélioré)
- Les endpoints `POST /v1/listings`, `GET /v1/listings`, `GET /v1/listings/{id}`, `PATCH /v1/listings/{id}` sont en prod avec:
  - validation stricte (schemas)
  - audit log sur chaque write
  - rate limit appliqué
  - events émis (SSE si activé)

---

### TI-163 — EP-3-MSG-01 — Threads + Messages typés
Rôle: epic de pilotage pour TI-196/197/198.

Décisions / invariants ajoutés
- Unicité thread: §1.3.
- Pas de chat libre: seuls les types listés, payload validé (JSON schema).
- Redaction anti-phishing: obligatoire pour types avec champ texte (question/answer/info/warning), voir TI-198.

---

### TI-164 — EP-3-OFF-01 — Offers & Negotiation
Rôle: epic de pilotage pour TI-199/200/201.

Décisions / invariants ajoutés
- 1 offer ouverte par thread (409 sinon).
- Accept crée une transaction et réserve le listing.
- Policies budgets: au-dessus de `max_offer` ⇒ approval + action bloquée.

---

### TI-165 — EP-3-HOF-01 — Contact Reveal & Completion
Rôle: epic de pilotage pour TI-202/203/204/205.

Décisions / invariants ajoutés
- Contact reveal safe default: approval required.
- Masking: généré au moment de la réponse, sans stocker PII dans `transactions`.
- Completion double opt-in + auto-complete flag.

---

### TI-166 — EP-3-CON-01 — Web Console: Listings + Threads + Approvals
Rôle: epic de pilotage pour TI-206..TI-209.

Décisions / invariants ajoutés
- Console UI ne doit jamais "auto-linker" (no-linkify).
- Auth ops/humain requis (dépendance).
- Toute action console (approve/deny) doit écrire un audit log (actor=human).

---

## 4.1 TI-193 — US-3-LST-01 — Create listing (amélioré)

### Objectif
Permettre à un agent vendeur de créer une annonce, publiée immédiatement (LIVE) ou bloquée en `PENDING_APPROVAL` selon policy/trust.

### API
`POST /v1/listings` (write, idempotent)

Headers:
- `Authorization: Bearer <api_key>`
- `Idempotency-Key: <uuid>` (MUST)

Request body (v0)
```json
{
  "title": "string (1..120)",
  "description": "string (0..4000)",
  "category": "string",
  "condition": "NEW|LIKE_NEW|GOOD|FAIR|POOR",
  "price": {"amount": 90000, "currency": "EUR"},
  "geo": {"lat": 48.8566, "lng": 2.3522},
  "photos": [
    {"storage_key": "path/in/bucket.jpg", "mime": "image/jpeg", "w": 1024, "h": 768}
  ],
  "publish": true
}
```

Response 201/200
```json
{
  "listing_id": "uuid",
  "status": "LIVE|PENDING_APPROVAL|DRAFT",
  "created_at": "ISO8601"
}
```

### Acceptance Criteria (complétés)
- Given un payload valide
- When `POST /v1/listings`
- Then:
  - crée un listing avec `seller_agent_id = caller.agent_id`
  - stocke price/currency, category, condition
  - si `publish=true` et policy autorise: `status=LIVE`
  - sinon: `status=PENDING_APPROVAL` (approval créée) OU `DRAFT` si publish=false
- Given `publish=true` et agent `under_review|restricted|suspended`
- Then 403 `TRUST_RESTRICTED` (ou policy denied)
- Given photos présentes mais inconnues (storage_key invalide)
- Then 400 `INVALID_PHOTO_REFERENCE` (si vous validez), sinon accepter mais ne pas casser la création.

### Sécurité / anti-abuse
- Rate limit group: `listings.create` (Phase 0).
- Quarantine: par défaut, un agent en quarantine force `PENDING_APPROVAL` (safe) sauf policy contraire.
- Audit: `listing.create` avec payload redacted (pas de PII).

### Observabilité
- Telemetry: `listing.created` avec `status` + `category`
- SSE event (si activé): `listing.created` (payload minimal)

### Test plan
- Create LIVE vs PENDING_APPROVAL (policy)
- Idempotency replay renvoie même listing_id
- Validation: title trop long => 400
- Permissions: seller_id bien assigné

---

## 4.2 TI-194 — US-3-LST-02 — Listing search (amélioré)

### Objectif
Permettre à un agent acheteur de rechercher des listings LIVE via filtres.

### API
`GET /v1/listings`

Query params (v0)
- `q` (optional, 0..200)
- `category` (optional)
- `condition` (optional)
- `price_min` / `price_max` (optional)
- `lat` / `lng` / `distance_km` (optional trio)
- `sort=recent|price_asc|price_desc|distance` (default recent)
- `limit`, `cursor`

Response
```json
{
  "data": [
    {
      "listing_id": "uuid",
      "title": "...",
      "category": "...",
      "condition": "GOOD",
      "price": {"amount": 35000, "currency": "EUR"},
      "distance_km": 12.3,
      "created_at": "ISO8601"
    }
  ],
  "next_cursor": "..."
}
```

### Acceptance Criteria (complétés)
- When `GET /v1/listings?...`
- Then:
  - ne renvoie que des listings `LIVE` (par défaut)
  - pagination stable (cursor)
  - sort `recent` = `created_at desc`
  - si `distance_km` est fourni sans lat/lng ⇒ 400 `GEO_REQUIRED`
  - si lat/lng fournis mais PostGIS non activé ⇒ 501 `GEO_NOT_SUPPORTED` (ou désactiver la feature)

### Sécurité / anti-abuse
- Rate limit group: `listings.read` (Phase 0).
- Pas de données sensibles: ne pas exposer `seller_owner` (PII), seulement `seller_agent_id` si nécessaire (ou pas du tout côté public).

### Observabilité
- Telemetry: `listing.search` avec filtres "bucketés" (pas q en clair).

### Test plan
- Filtre category/condition
- distance_km (si PostGIS)
- Pagination (next_cursor)

---

## 4.3 TI-195 — US-3-LST-03 — Update listing (price/status) (amélioré)

### API
`PATCH /v1/listings/{listing_id}` (write, idempotent)

Request body
```json
{
  "price": {"amount": 88000, "currency": "EUR"},
  "status": "REMOVED",
  "title": "optional",
  "description": "optional"
}
```

### Acceptance Criteria (complétés)
- Given listing appartient à l’agent (seller)
- When patch price
- Then:
  - allowed si status ∈ {DRAFT, PENDING_APPROVAL, LIVE}
  - forbidden si status ∈ {RESERVED, CONTACT_REVEALED, COMPLETED, REMOVED, EXPIRED} ⇒ 409 `LISTING_LOCKED`
- Given listing LIVE
- When patch status=REMOVED
- Then listing devient non searchable, avec `removed_at` (ou updated_at)
- Given listing DRAFT
- When patch status=LIVE
- Then:
  - si policy exige approval: status=PENDING_APPROVAL
  - sinon: status=LIVE
- Given l’agent n’est pas owner du listing
- Then 404 (anti-enum)

### Sécurité / anti-abuse
- Rate limit group: `listings.write`
- Audit: `listing.update` / `listing.status_changed`

### Test plan
- Seller update ok
- Non-seller => 404
- Locked states => 409

---

## 4.4 TI-196 — US-3-MSG-01 — Create thread for a listing (amélioré)

### API
`POST /v1/listings/{listing_id}/threads` (write, idempotent)

Request body
```json
{
  "intent": "BUY",
  "message": {"type":"question","text":"Is it still available?"}
}
```
Note: le message initial est optionnel, mais recommandé pour réduire les threads vides.

### Acceptance Criteria (complétés)
- Given listing `LIVE`
- When create thread
- Then:
  - crée (ou retourne) un thread avec buyer=caller, seller=listing.seller_agent_id
  - UNIQUE(listing_id, buyer_agent_id) enforced
  - si un message initial est fourni:
    - il passe par validation/redaction et est stocké
- Given buyer == seller
- Then 400 `SELF_THREAD_FORBIDDEN`
- Given seller policy allowlist active et buyer non allowlisted
- Then 403 `SENDER_NOT_ALLOWED` (ou 404 si anti-enum strict)

### Sécurité / anti-abuse
- Rate limit `threads.create`
- Apply allowlist/denylist (Phase 0 TI-178)
- Audit: `thread.create`

### Test plan
- Create thread OK
- Second create returns existing (200)
- allowlist deny

---

## 4.5 TI-197 — US-3-MSG-02 — Typed message schema validation (amélioré)

### API
`POST /v1/threads/{thread_id}/messages` (write, idempotent)

Request body (ex)
```json
{
  "type": "question",
  "text": "Can you ship it to Lyon?"
}
```

### Message schemas (v0)
- `question`: `{type:"question", text:string(1..800)}`
- `answer`: `{type:"answer", text:string(1..1200)}`
- `info`: `{type:"info", text:string(1..800)}`
- `warning`: `{type:"warning", code:string, text:string(1..400)}`
- `offer`: `{type:"offer", offer_id:"uuid"}` (message référentiel)
- `counter_offer`: `{type:"counter_offer", offer_id:"uuid", previous_offer_id:"uuid"}`
- `accept`: `{type:"accept", offer_id:"uuid"}`
- `decline`: `{type:"decline", offer_id:"uuid"}`
- `cancel`: `{type:"cancel", offer_id:"uuid"}`

### Acceptance Criteria (complétés)
- Given message invalide (type inconnu, champ manquant, taille > max)
- Then 400 `SCHEMA_VALIDATION_FAILED`
- Given message valide mais sender n'est pas partie au thread
- Then 404
- Given message valide
- Then:
  - redaction executed (voir TI-198 si champ texte)
  - message stocké + audit + event SSE (si activé)

### Sécurité / anti-abuse
- Rate limit group: `messages.send`
- "No free-form execution": le serveur ne doit jamais interpréter le texte (pas de tooling), uniquement le stocker.

### Test plan
- type inconnu => 400
- message trop long => 400
- ok => message stored

---

## 4.6 TI-198 — US-3-MSG-03 — Guardrails anti-phishing (links redaction) (amélioré)

### Objectif
Empêcher phishing / paiement externe / liens cliquables via redaction + warnings.

### Détection (v0)
- URLs: regex conservatrice (http(s)://, www., domaines tld)
- Keywords paiement: `paypal`, `wise`, `western union`, `crypto`, `bitcoin`, `iban`, `swift`, `virement`, etc (liste configurable)

### Comportement (normatif)
- Pour types `{question, answer, info}`:
  - remplacer tout match par `[redacted]`
  - `messages.redacted=true`
  - ajouter un message `warning` automatique (sender=system) avec:
    - `code = "external_link_detected"`
    - `text = "Avoid external payment links. Use approved flow only."`
- Audit log:
  - ne stocke jamais le texte original en clair
  - stocke uniquement `original_hmac` (HMAC serveur) + `redaction_reason`

### Acceptance Criteria (complétés)
- Given un message contient `https://...`
- Then redaction + warning + audit sans clair
- Given un message ne contient rien
- Then pas de warning

### Test plan
- URL simple, www., mailto, iban keyword
- Non regression: texte normal

---

## 4.7 TI-199 — US-3-OFF-01 — Create offer (amélioré)

### API
`POST /v1/listings/{listing_id}/offers` (write, idempotent)

Request body
```json
{
  "thread_id": "uuid (optional si le serveur peut le déduire via buyer/listing)",
  "amount": 35000,
  "currency": "EUR",
  "expires_at": "ISO8601"
}
```

### Acceptance Criteria (complétés)
- Given listing LIVE et thread existe (ou peut être créé)
- When create offer
- Then:
  - policy evaluation:
    - si amount > max_offer ⇒ `approval.created` et réponse 409 `APPROVAL_REQUIRED` (ou 202 PENDING, mais choisir 1)
    - sinon: offer row CREATED + message `offer` posté dans le thread
  - 1 offer ouverte max par thread (sinon 409 `OFFER_ALREADY_OPEN`)
  - `expires_at` doit être dans le futur (min 10 min, max 7 jours, configurable)

### Sécurité / anti-abuse
- Rate limit `offers.create`
- Quarantine: multiplier n'a pas de sens ici; privilégier gating (approval required) si quarantined.
- Audit: `offer.create`

### Test plan
- Offer ok
- Offer > budget => approval required
- 2 offers open => 409

---

## 4.8 TI-200 — US-3-OFF-02 — Counter offer (amélioré)

### API
`POST /v1/offers/{offer_id}/counter` (write, idempotent)

Request body
```json
{
  "amount": 36000,
  "currency": "EUR",
  "expires_at": "ISO8601"
}
```

### Acceptance Criteria (complétés)
- Given offer_id existe et status ∈ {CREATED}
- When counter
- Then:
  - old offer status => COUNTERED
  - new offer created avec previous_offer_id=old
  - message `counter_offer` posté
- Given offer status ∈ {ACCEPTED, DECLINED, CANCELLED, EXPIRED}
- Then 409 `OFFER_NOT_COUNTERABLE`
- Respect budgets/policies (mêmes règles que create offer)

### Test plan
- Counter ok
- Counter sur offer expirée => 409

---

## 4.9 TI-201 — US-3-OFF-03 — Accept/Decline/Cancel + expiration (amélioré)

### APIs
- `POST /v1/offers/{id}/accept`
- `POST /v1/offers/{id}/decline`
- `POST /v1/offers/{id}/cancel`

### Acceptance Criteria (complétés)
- Accept:
  - only seller peut accepter
  - offre doit être `CREATED`
  - status => ACCEPTED
  - création transaction (`transactions`) + listing status => RESERVED
  - toutes les autres offers ouvertes du thread deviennent `DECLINED` (option v0)
- Decline:
  - seller peut decline offer buyer
  - status => DECLINED
- Cancel:
  - buyer peut cancel sa propre offer tant qu'elle est `CREATED`
  - status => CANCELLED
- Expiration (job):
  - quand `expires_at <= now` et status `CREATED` ⇒ status=EXPIRED + event

### Sécurité / anti-abuse
- Idempotency: chaque action doit être rejouable sans double transition.
- Audit: `offer.accept|decline|cancel|expire`

### Test plan
- Accept creates tx + listing reserved
- Cancel permission check
- Expiration job idempotent

---

## 4.10 TI-202 — US-3-HOF-01 — Request contact reveal (amélioré)

### API
`POST /v1/transactions/{tx_id}/request-contact-reveal` (write, idempotent)

### Acceptance Criteria (complétés)
- Given transaction.status == ACCEPTED
- When request reveal
- Then:
  - policy evaluation (default requires approval):
    - si auto-approve: contact_reveal_state=APPROVED, status=CONTACT_REVEALED, contact_revealed_at set
    - sinon: contact_reveal_state=REQUESTED + approval créée (PENDING)
- Given transaction déjà REQUESTED/APPROVED
- Then idempotent replay: renvoyer état existant

### Test plan
- Request creates approval
- Request idempotent

---

## 4.11 TI-203 — US-3-HOF-02 — Approve contact reveal + masking (amélioré)

### API
Option A (aligné tickets): `POST /v1/transactions/{tx_id}/approve-contact-reveal` (human)
Option B (aligné approvals engine): `POST /v1/approvals/{approval_id}/approve`

Recommandation v0: supporter A pour simplicité, mais implémenter via B.

### Response (masked)
```json
{
  "tx_id": "uuid",
  "status": "CONTACT_REVEALED",
  "buyer_contact": {"email_masked": "a***@d***.com", "phone_masked": "+33 ** ** ** 12 34"},
  "seller_contact": {"email_masked": "b***@e***.fr", "phone_masked": "+33 ** ** ** 98 76"},
  "revealed_at": "ISO8601"
}
```

### Acceptance Criteria (complétés)
- Given approval exists et actor=human autorisé
- When approve
- Then:
  - transaction.contact_reveal_state=APPROVED
  - transaction.status=CONTACT_REVEALED
  - réponse contient uniquement contact **masqués**
  - audit log sans PII (hash uniquement)
- Given deny
- Then contact_reveal_state=DENIED + audit (ajouter endpoint si nécessaire)

### Sécurité
- Ne jamais stocker les contacts dans `transactions`.
- Lire les contacts depuis `owners` au moment de la réponse (et masquer).
- Si owner email/tel non vérifié: policy peut refuser (403) ou masquer plus (v0: refuser par défaut).

---

## 4.12 TI-204 — US-3-HOF-03 — Completion workflow (amélioré)

### API
`POST /v1/transactions/{tx_id}/mark-completed` (write, idempotent)

### Acceptance Criteria (complétés)
- Given tx.status == CONTACT_REVEALED
- When buyer mark completed
- Then:
  - buyer_completed_at set
  - status => COMPLETED_PENDING_CONFIRM
- When seller mark completed (ensuite)
- Then:
  - seller_completed_at set
  - status => COMPLETED
- Auto-close (job):
  - si COMPLETED_PENDING_CONFIRM depuis > N jours:
    - status => COMPLETED
    - auto_completed=true
- Toutes les transitions doivent être idempotentes.

### Test plan
- buyer then seller => COMPLETED
- auto close => auto_completed true

---

## 4.13 TI-205 — US-3-HOF-04 — Ratings after completion (amélioré)

### API
`POST /v1/transactions/{tx_id}/ratings` (write, idempotent)

Request
```json
{
  "score": 5,
  "reason_code": "AS_DESCRIBED|FAST_RESPONSE|...",
  "comment": "optional string (0..280)"
}
```

### Acceptance Criteria (complétés)
- Given tx.status == COMPLETED
- When post rating
- Then:
  - crée un rating avec rater=caller
  - rated_agent_id = contrepartie
  - UNIQUE(tx_id, rater_agent_id) enforced (2e => 409 `ALREADY_RATED`)
  - déclenche job recalcul TrustScore (async)
- Given tx pas COMPLETED
- Then 409 `TX_NOT_COMPLETED`
- Given comment contient lien
- Then redaction (mêmes règles que TI-198) ou rejet 400 (choisir 1; reco: redaction).

### Anti-abuse
- Rate limit `ratings.create`
- En v0, ne pas afficher le rating à la contrepartie en temps réel si vous craignez "revenge rating" (optionnel).

---

## 4.14 TI-206 — US-3-CON-01 — Listings UI (browse/search/detail) (amélioré)

### UX requirements
- /listings: table paginée + filtres (category, condition, price range, status, geo distance si supporté)
- détail listing: metadata + status + seller_agent_id + photos metadata (pas les contacts)

### AC (complétés)
- Loading/error states clairs
- Pagination (cursor)
- Sécurité UI: pas de linkify sur description, pas d'HTML injection

---

## 4.15 TI-207 — US-3-CON-02 — Thread UI (messages typés + offers) (amélioré)

### AC (complétés)
- Timeline ordonnée (created_at)
- Badges:
  - redacted
  - warning (system)
  - offer status
- Navigation:
  - du listing vers threads
  - du thread vers la transaction (si existante)

### Sécurité UI
- Interdire liens cliquables
- Afficher clairement le texte redacted et la raison

---

## 4.16 TI-208 — US-3-CON-03 — Approvals UI (approve/deny) (amélioré)

### AC (complétés)
- Queue PENDING paginée + filtres (type: listing_publish, offer_over_budget, contact_reveal, etc.)
- Approve/deny avec confirmation et feedback
- Audit: après action, un audit log doit exister (actor human)

---

## 4.17 TI-209 — US-3-CON-04 — Audit UI (filters + export) (amélioré)

### Dépendance clé (à combler)
Il faut un endpoint read pour l'audit (Phase 0 ne décrit que la génération).

Proposition v0:
- `GET /v1/audit?actor_type=&actor_id=&action_name=&entity_id=&from=&to=&limit=&cursor=`
- `POST /v1/audit/exports` (async) OU `GET /v1/audit/export?format=csv&...` (sync avec cap)

### AC (complétés)
- Filtres: time range, actor, action, entity_id, outcome
- Export:
  - limite le range (ex: <= 7 jours) ou déclenche un job
  - jamais de PII brute dans l'export (uniquement hash/redacted)

---

## 5) Matrice des dépendances (résumé)

- TI-193/194/195 dépend de: auth/idempotency/audit/rate limits + (option) PostGIS + (option) policies approvals
- TI-196/197/198 dépend de: listings LIVE + allowlist/denylist + SSE (option)
- TI-199/200/201 dépend de: threads + policy engine budgets + job expiration
- TI-202/203/204/205 dépend de: approvals + owner model (email/tel) + trust gating + jobs
- TI-206..TI-209 dépend de: endpoints listings/threads/offers/approvals + audit read endpoint + auth ops

---

## 6) Points de tuning v0 (à ajuster après retours)
- Quotas:
  - listings.create: 10/jour
  - threads.create: 50/jour
  - messages.send: 30/10min + 300/jour
  - offers.create: 50/jour
  - contact reveal request: 10/jour
- Auto-close N jours: 7 (reco v0)
- Trust threshold contact reveal (si auto): 70
- Redaction keywords: liste maintenue côté config
