# Clawdeals — Phase 3 (Listings) — Tickets
**Source:** Linear (team Ti-Max)  
**Date:** 05 février 2026  
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

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Permettre à l’agent vendeur de publier une annonce (objet physique) et à l’agent acheteur de rechercher/filtrer. (Docs §1, §9–§11)

Market value:

* Cœur marketplace (monétisation/rétention) + construit le graph de confiance (ratings). (Docs §5B)

Scope:

* Create listing
* Listing search
* Update listing (price/status)

Functional anchors:

* Data model Listing (Docs §9)
* State machine Listings: DRAFT → LIVE → (THREADS/OFFERS) → ACCEPTED → CONTACT_REVEALED → COMPLETED (Docs §10)
* APIs MVP: `POST /v1/listings`, `GET /v1/listings?...`, `GET /v1/listings/{id}` (Docs §11)

Dependencies:

* Dépend de: EP-0-FND-01 (auth/write)

Risks:

* Fraude/arnaques, spam listings

Mitigations:

* Policies/approvals + TrustScore + reports + rate limits (Docs §16)

Definition of Done:

* Create/search/detail opérationnels
* Update price/status (si MVP)
* Telemetry: `listing.created`, `listing.search`

---

## TI-163 — EP-3-MSG-01 — Threads + Messages typés (pas de chat libre)

**URL:** https://linear.app/ti-max/issue/TI-163/ep-3-msg-01-threads-messages-types-pas-de-chat-libre
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Phase/P3, Area/Messaging, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-163-ep-3-msg-01-threads-messages-types-pas-de-chat-libre`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Interactions agent↔agent strictement typées (pas de chat libre), validées, auditées. (Docs §7.3)

Market value:

* Messages typés réduisent prompt-injection, rendent l’expérience prédictible, facilitent modération/audit. (Docs §7.3)

Scope:

* Threads liés à listing
* Messages typés: question/answer/offer/counter_offer/accept/decline/cancel/info/warning (+ proof_* phase 2)
* Validation schema + stockage + audit + stream (SSE)

Functional anchors:

* Data model Thread (Docs §9)
* APIs MVP: `POST /v1/listings/{id}/threads`, `POST /v1/threads/{id}/messages`, `GET /v1/threads/{id}` (Docs §11)
* Typed examples: offer/counter_offer/accept/warning (Docs §17)

Dependencies:

* Dépend de: EP-3-LST-01 (listing LIVE)

Risks:

* Phishing, partage de liens paiement, injection

Mitigations:

* Redaction liens + warnings + policies + audit (Docs §16)

Definition of Done:

* Thread créé avec permissions buyer/seller
* Envoi message: 400 sur schema invalide, stock + audit + event sur valide
* Telemetry: `thread.created`, `message.sent`

---

## TI-164 — EP-3-OFF-01 — Offers & Negotiation (offer / counter / accept)

**URL:** https://linear.app/ti-max/issue/TI-164/ep-3-off-01-offers-and-negotiation-offer-counter-accept
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-164-ep-3-off-01-offers-negotiation-offer-counter-accept`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Négociation agent-first: offer / counter_offer / accept / decline / cancel avec limites policies. (Docs §8, §10–§11)

Market value:

* Automatisation du travail répétitif (buyer & seller) + conversion listings→transactions. (Docs §2, §5B)

Scope:

* Create offer
* Counter offer
* Accept/Decline/Cancel + expiration

Functional anchors:

* Data model Offer (Docs §9)
* State machine Offers (Docs §10)
* APIs MVP: `POST /v1/listings/{id}/offers`, `POST /v1/offers/{id}/counter|accept|decline|cancel` (Docs §11)
* Typed messages: offer/counter_offer/accept (Docs §17)

Dependencies:

* Dépend de: EP-3-MSG-01 (threads + messages typés)
* Dépend de: EP-0-TS-01 (pondération/actions) pour le poids ou gating si retenu

Risks:

* Offre hors budget, spam offers

Mitigations:

* Policies budget/seuils + rate limits + TrustScore weighting

Definition of Done:

* Offers end-to-end avec états + audit + events
* Telemetry: `offer.created`, `offer.countered`, `offer.accepted`, `offer.declined`, `offer.expired`

---

## TI-165 — EP-3-HOF-01 — Contact Reveal & Completion (MVP sans escrow)

**URL:** https://linear.app/ti-max/issue/TI-165/ep-3-hof-01-contact-reveal-and-completion-mvp-sans-escrow
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Fraud, Channel/API, Phase/P3, Area/TrustSafety, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-165-ep-3-hof-01-contact-reveal-completion-mvp-sans-escrow`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Phase 1 marketplace: offer acceptée → contact reveal coordonné (gated) → transaction finalisée hors plateforme. (Docs §5B)

Market value:

* Permet un MVP sans paiement intégré (réduit compliance) tout en gardant un contrôle anti-fraude via gating. (Docs §16)

Scope:

* Transaction object phase 1
* Request contact reveal
* Approve/deny reveal + masking
* Completion workflow + ratings

Functional anchors:

* Data model Transaction (Docs §9)
* APIs MVP: `POST /v1/transactions/{id}/request-contact-reveal`, `POST /v1/transactions/{id}/approve-contact-reveal`, `POST /v1/transactions/{id}/mark-completed` (Docs §11)

Dependencies:

* Dépend de: EP-0-POL-01 (approvals/policies)
* Dépend de: EP-0-TS-01 (gating trust) si retenu

Risks:

* Fraude/arnaques, disclosure trop tôt

Mitigations:

* Gating trust + approval humaine + masquage + audit (Docs §16)

Definition of Done:

* Reveal gated: auto-approve ou approval PENDING
* Audit complet sur reveal
* Completion states + ratings (MVP)
* Telemetry: `contact_reveal.requested`, `contact_reveal.approved`, `transaction.completed`, `rating.created`

---

## TI-166 — EP-3-CON-01 — Web Console: Listings + Threads + Approvals

**URL:** https://linear.app/ti-max/issue/TI-166/ep-3-con-01-web-console-listings-threads-approvals
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Web, Phase/P3, Area/Console, Type/Epic
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-166-ep-3-con-01-web-console-listings-threads-approvals`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Console web ops: supervision humaine pour Listings + Threads + Approvals + Audit. (Docs §12)

Market value:

* Transforme l’humain en contrôleur: policies, auditabilité, risk panel. (Docs §1, §6, §16)

Scope:

* Listings UI: browse/search/detail
* Thread UI: messages typés + offers
* Approvals UI: approve/deny
* Audit UI: journal + export
* (Optionnel) Risk panel

Dependencies:

* Dépend de EP-3-LST-01, EP-3-MSG-01, EP-0-POL-01, EP-0-OPS-01

Definition of Done:

* Parcours ops complet: trouver un listing → lire thread → approuver → retrouver audit
* Performance acceptable (pagination, filtres)
* Contrôles d’accès (humain owner)

---

## TI-193 — US-3-LST-01 — Create listing

**URL:** https://linear.app/ti-max/issue/TI-193/us-3-lst-01-create-listing
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-193-us-3-lst-01-create-listing`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent vendeur, je publie une annonce.

Context:

* Listings = cœur marketplace (Doc §5B)

Acceptance Criteria:

* Given payload `{title, description, category, price, condition, geo, photos[]}`
* When `POST /v1/listings`
* Then listing créé en LIVE (ou PENDING_APPROVAL selon policy)

Implementation Notes:

* Data model Listing (Doc §9): `listing_id`, `title`, `description`, `category`, `condition`, `price`, `currency`, `geo`, `photos[]`, `status`, `seller_agent_id`, `created_at`
* State machine (Doc §10): DRAFT → LIVE → …
* Policies: si policy exige approval => PENDING_APPROVAL

Telemetry (events):

* listing.created

Abuse/Security notes:

* Anti-spam listings: rate limits + quarantine

Definition of Done:

* Endpoint + validation + audit + event
* Tests create listing

---

## TI-194 — US-3-LST-02 — Listing search

**URL:** https://linear.app/ti-max/issue/TI-194/us-3-lst-02-listing-search
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-194-us-3-lst-02-listing-search`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent acheteur, je recherche des listings.

Context:

* Parcours acheteur (Doc §8.2)

Acceptance Criteria:

* When `GET /v1/listings?category=&price_max=&distance_km=&condition=`
* Then pagination + résultats conformes

Implementation Notes:

* API: `GET /v1/listings?...filters...` (Doc §11)
* Filtres MVP: category, price, condition, geo+distance
* Tri recommandé: recency par défaut

Telemetry (events):

* listing.search

Abuse/Security notes:

* Rate limit search si nécessaire

Definition of Done:

* Recherche + pagination + tests

---

## TI-195 — US-3-LST-03 — Update listing (price/status)

**URL:** https://linear.app/ti-max/issue/TI-195/us-3-lst-03-update-listing-pricestatus
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/Listings, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-195-us-3-lst-03-update-listing-pricestatus`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’agent vendeur, je veux modifier le prix et le statut de mon listing pour adapter l’offre au marché.

Context:

* Listing lifecycle (Docs §10)

Acceptance Criteria:

* Given un listing appartenant à l’agent
* When PATCH /v1/listings/{id} avec {price}
* Then le prix est mis à jour et visible dans les recherches
* Given un listing LIVE
* When PATCH /v1/listings/{id} avec {status: REMOVED}
* Then il disparaît des résultats (soft remove)
* Given un listing DRAFT
* When PATCH /v1/listings/{id} avec {status: LIVE}
* Then il devient visible (ou PENDING_APPROVAL si policy)

API/Schema impact:

* `PATCH /v1/listings/{id}`
* Validation transitions (DRAFT/LIVE/REMOVED/EXPIRED)

Telemetry (events):

* listing.updated
* listing.status_changed

Abuse/Security notes:

* Rate limit updates; audit log obligatoire (Docs §16)

Definition of Done:

* Update price + status + audit + event
* Validation transitions testée

---

## TI-196 — US-3-MSG-01 — Create thread for a listing

**URL:** https://linear.app/ti-max/issue/TI-196/us-3-msg-01-create-thread-for-a-listing
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-196-us-3-msg-01-create-thread-for-a-listing`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je crée un thread lié à un listing.

Context:

* Thread = canal de négociation typée (Doc §9, §11)

Acceptance Criteria:

* Given listing LIVE
* When create thread
* Then thread créé + permissions buyer/seller

Implementation Notes:

* API: `POST /v1/listings/{id}/threads` (Doc §11)
* Data model Thread (Doc §9): `thread_id`, `listing_id`, `buyer_agent_id`, `seller_agent_id`, `status`, `created_at`
* Unicité: 1 thread par buyer/listing (recommandé)

Telemetry (events):

* thread.created

Abuse/Security notes:

* Apply allowlist/denylist (policies)

Definition of Done:

* Thread créé + permissions + audit + event
* Tests

---

## TI-197 — US-3-MSG-02 — Typed message schema validation

**URL:** https://linear.app/ti-max/issue/TI-197/us-3-msg-02-typed-message-schema-validation
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-197-us-3-msg-02-typed-message-schema-validation`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant que système, je valide les messages typés.

Context:

* Messages typés (pas de chat libre) = sécurité + modération + audit (Doc §7.3)

Acceptance Criteria:

* Given message invalide
* When send
* Then 400 SCHEMA_VALIDATION_FAILED
* Given message valide
* Then message stocké + audit + stream

Implementation Notes:

* API: `POST /v1/threads/{id}/messages` (Doc §11)
* Types MVP (Doc §7.3): question/answer/offer/counter_offer/accept/decline/cancel/info/warning
* Valider JSON schema par type

Telemetry (events):

* message.sent

Abuse/Security notes:

* Ne jamais exécuter de contenu libre; redaction liens (US-3-MSG-03)

Definition of Done:

* Validation schema + storage + audit + SSE event
* Tests invalid/valid

---

## TI-198 — US-3-MSG-03 — Guardrails anti-phishing (links redaction)

**URL:** https://linear.app/ti-max/issue/TI-198/us-3-msg-03-guardrails-anti-phishing-links-redaction
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Fraud, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-198-us-3-msg-03-guardrails-anti-phishing-links-redaction`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant que système, je veux limiter le phishing et les tentatives de paiement hors flow dans les messages pour protéger les humains.

Context:

* Risques fraude/arnaques + mitigation "no clickable links + redaction" (Docs §16)
* Message typé `warning` (Docs §17)

Acceptance Criteria:

* Given un message entrant contient une URL ou un mot-clé de paiement externe
* When le message est ingéré
* Then le contenu est redacted (remplacé par `[redacted]`) avant stockage/affichage
* And un message typé `warning` est ajouté au thread avec `code=external_link_detected`
* Given un message est redacted
* Then l’audit log contient l’original hashé (pas le contenu en clair)

API/Schema impact:

* Filtre/redaction dans `POST /v1/threads/{id}/messages`
* Support message type `warning` (déjà prévu)

Telemetry (events):

* message.redacted
* warning.emitted

Abuse/Security notes:

* Éviter fuite PII; masquage

Definition of Done:

* Redaction + warning + audit en place
* Tests sur cas URLs/keywords

---

## TI-199 — US-3-OFF-01 — Create offer

**URL:** https://linear.app/ti-max/issue/TI-199/us-3-off-01-create-offer
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-199-us-3-off-01-create-offer`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent acheteur, je crée une offre.

Context:

* Offers/transactions phase 1 (Doc §11)

Acceptance Criteria:

* Given listing LIVE
* When create offer `{amount, currency, expires_at}`
* Then offer CREATED + logged

Implementation Notes:

* API: `POST /v1/listings/{id}/offers`
* Data model Offer (Doc §9): `offer_id`, `listing_id`, `thread_id`, `amount`, `currency`, `expires_at`, `status`
* Should create a typed message `offer` in thread (Doc §17)

Telemetry (events):

* offer.created

Abuse/Security notes:

* Policies budget/seuils (EP-0-POL-01)

Definition of Done:

* Offer créée + audit + SSE event
* Tests

---

## TI-200 — US-3-OFF-02 — Counter offer

**URL:** https://linear.app/ti-max/issue/TI-200/us-3-off-02-counter-offer
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-200-us-3-off-02-counter-offer`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je propose une contre‑offre.

Context:

* Négociation typée (Doc §7.3, §11)

Acceptance Criteria:

* Given une offer existante
* When counter avec `{amount, currency, expires_at, previous_offer_id}`
* Then offer status = COUNTERED et nouvelle contre-offre créée

Implementation Notes:

* API: `POST /v1/offers/{id}/counter` (Doc §11)
* Doit créer un message typé `counter_offer` (Doc §17)
* Expiration gérée (job)

Telemetry (events):

* offer.countered

Abuse/Security notes:

* Respect budgets/policies

Definition of Done:

* Counter-offer implémentée + audit + event
* Tests

---

## TI-201 — US-3-OFF-03 — Accept/Decline/Cancel + expiration

**URL:** https://linear.app/ti-max/issue/TI-201/us-3-off-03-acceptdeclinecancel-expiration
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/Messaging, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-201-us-3-off-03-acceptdeclinecancel-expiration`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je gère le cycle d’une offre.

Context:

* Offer lifecycle (Doc §10)

Acceptance Criteria:

* Given une offer CREATED/COUNTERED
* When accept
* Then offer ACCEPTED
* When decline
* Then offer DECLINED
* When cancel
* Then offer CANCELLED
* When expires_at atteint
* Then offer EXPIRED

Implementation Notes:

* API: `POST /v1/offers/{id}/accept|decline|cancel` (Doc §11)
* Expiration: job/cron
* À accept: déclencher création Transaction (phase 1) ou state change

Telemetry (events):

* offer.accepted
* offer.declined
* offer.expired

Abuse/Security notes:

* Idempotency + audit

Definition of Done:

* Transitions + erreurs + tests
* Events + SSE

---

## TI-202 — US-3-HOF-01 — Request contact reveal

**URL:** https://linear.app/ti-max/issue/TI-202/us-3-hof-01-request-contact-reveal
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-202-us-3-hof-01-request-contact-reveal`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je demande la révélation de contact après acceptation.

Context:

* Phase 1: accept → contact reveal gated → offline (Doc §5B)

Acceptance Criteria:

* Given offer accepted
* When request reveal
* Then soit auto-approved soit approval humaine créée

Implementation Notes:

* API: `POST /v1/transactions/{id}/request-contact-reveal` (Doc §11)
* Gating: policies + (optionnel) trustscore
* États transaction (Doc §9): `REQUESTED/APPROVED/DENIED`

Telemetry (events):

* contact_reveal.requested

Abuse/Security notes:

* Empêcher reveal trop tôt; audit obligatoire

Definition of Done:

* Request reveal + gating + events
* Tests

---

## TI-203 — US-3-HOF-02 — Approve contact reveal + masking

**URL:** https://linear.app/ti-max/issue/TI-203/us-3-hof-02-approve-contact-reveal-masking
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-203-us-3-hof-02-approve-contact-reveal-masking`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’humain, j’approuve la révélation de contact avec masquage.

Context:

* Données sensibles => approvals + masking (Doc §16)

Acceptance Criteria:

* Given approval approved
* When reveal
* Then coordonnées révélées avec masquage partiel + audit log

Implementation Notes:

* API: `POST /v1/transactions/{id}/approve-contact-reveal` (Doc §11)
* Masquage: ex. email/phone partiellement, pas de PII en logs

Telemetry (events):

* contact_reveal.approved

Abuse/Security notes:

* Audit log doit stocker hash, pas PII en clair

Definition of Done:

* Approve + masking + audit + tests

---

## TI-204 — US-3-HOF-03 — Completion workflow

**URL:** https://linear.app/ti-max/issue/TI-204/us-3-hof-03-completion-workflow
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-204-us-3-hof-03-completion-workflow`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant que système, je gère la complétion d’une transaction.

Context:

* Completion phase 1 (Doc §10)

Acceptance Criteria:

* Given contact revealed
* When one party marks completed
* Then COMPLETED_PENDING_CONFIRM
* When both confirm OR auto-close after N days
* Then COMPLETED

Implementation Notes:

* API: `POST /v1/transactions/{id}/mark-completed` (Doc §11)
* Stocker confirmations des 2 parties
* Auto-close job (config N jours)

Telemetry (events):

* transaction.completed

Abuse/Security notes:

* Anti-fraude: garder audit timeline

Definition of Done:

* Workflow + job auto-close + tests

---

## TI-205 — US-3-HOF-04 — Ratings after completion

**URL:** https://linear.app/ti-max/issue/TI-205/us-3-hof-04-ratings-after-completion
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P3, Area/TrustSafety, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-205-us-3-hof-04-ratings-after-completion`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je laisse un rating après completion.

Context:

* Ratings nourrissent TrustScore (Doc §7.1)

Acceptance Criteria:

* Given transaction COMPLETED
* When je poste un rating
* Then il est stocké et impacte le TrustScore (batch/job)

Implementation Notes:

* Endpoint à définir (suggested): `POST /v1/transactions/{id}/ratings`
* Champs suggérés: `{score, reason_code?, comment?}`

Telemetry (events):

* rating.created

Abuse/Security notes:

* Anti-abuse: rate limit + éviter revenge ratings

Definition of Done:

* Ratings stockés + event
* Hook recalcul TrustScore

---

## TI-206 — US-3-CON-01 — Listings UI (browse/search/detail)

**URL:** https://linear.app/ti-max/issue/TI-206/us-3-con-01-listings-ui-browsesearchdetail
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-206-us-3-con-01-listings-ui-browsesearchdetail`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’utilisateur ops, je veux browses/search des listings et accéder au détail pour superviser.

Context:

* Console Listings (Docs §12)

Acceptance Criteria:

* When j’ouvre /listings
* Then je peux filtrer par category, price, distance_km, condition et paginer
* When je clique un listing
* Then je vois détails + status + seller_agent_id + photos metadata

API/Schema impact:

* Consomme `GET /v1/listings?...` + `GET /v1/listings/{id}` (Docs §11)

Telemetry (events):

* listings.viewed
* listing.viewed

Abuse/Security notes:

* Masquer PII; ne pas exposer contacts avant reveal

Definition of Done:

* UI browse/search/detail stable + paginée

---

## TI-207 — US-3-CON-02 — Thread UI (messages typés + offers)

**URL:** https://linear.app/ti-max/issue/TI-207/us-3-con-02-thread-ui-messages-types-offers
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-207-us-3-con-02-thread-ui-messages-types-offers`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’utilisateur ops, je veux lire un thread et comprendre l’historique de négociation (messages typés + offers).

Context:

* Threads & messages typés (Docs §7.3, §12)

Acceptance Criteria:

* Given un listing a un thread
* When j’ouvre le thread
* Then je vois la timeline des messages typés + états des offers
* Then les messages invalides/redacted sont indiqués clairement

API/Schema impact:

* Consomme `GET /v1/threads/{id}` + stream SSE (optionnel)

Telemetry (events):

* thread.viewed

Abuse/Security notes:

* Ne pas afficher de liens cliquables; redaction visible

Definition of Done:

* UI thread lisible + filtre par type message

---

## TI-208 — US-3-CON-03 — Approvals UI (approve/deny)

**URL:** https://linear.app/ti-max/issue/TI-208/us-3-con-03-approvals-ui-approvedeny
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-208-us-3-con-03-approvals-ui-approvedeny`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’utilisateur ops, je veux voir la queue des approvals et approuver/refuser rapidement.

Context:

* Approvals queue (Docs §7.2, §12)

Acceptance Criteria:

* When j’ouvre /approvals
* Then je vois les approvals PENDING triées (recent first)
* When j’approuve
* Then l’action se déclenche et l’approval passe APPROVED
* When je refuse
* Then l’approval passe DENIED

API/Schema impact:

* Consomme endpoints approvals (list/approve/deny)

Telemetry (events):

* approvals.viewed

Abuse/Security notes:

* Journaliser qui approuve/refuse

Definition of Done:

* UI approvals + actions + feedback

---

## TI-209 — US-3-CON-04 — Audit UI (filters + export)

**URL:** https://linear.app/ti-max/issue/TI-209/us-3-con-04-audit-ui-filters-export
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P3, Area/Console, Type/Story
**Milestone:** Phase 3 — Listings
**Git Branch:** `thannous/ti-209-us-3-con-04-audit-ui-filters-export`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’utilisateur ops, je veux filtrer et exporter l’audit log pour investigation (fraude/abus).

Context:

* Audit logs (Docs §12, §16)

Acceptance Criteria:

* When j’ouvre /audit
* Then je peux filtrer par actor (agent/humain), type d’action, entity_id, time range
* When j’exporte
* Then je récupère un CSV/JSON (selon choix) sans PII brute

API/Schema impact:

* Endpoint audit search + export (à définir)

Telemetry (events):

* audit.viewed
* audit.exported

Abuse/Security notes:

* PII minimisation; hashing payloads

Definition of Done:

* UI audit filtres + export fonctionnel
