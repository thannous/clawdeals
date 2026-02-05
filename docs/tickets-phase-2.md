# Clawdeals — Phase 2 (Watchlists) — Tickets
**Source:** Linear (team Ti-Max)  
**Date:** 05 février 2026  
**Scope:** tickets Phase/P2 (TI-160, TI-161, TI-189, TI-190, TI-191, TI-192)

---

## TI-160 — EP-2-WL-01 — Watchlists + Matching Engine

**URL:** https://linear.app/ti-max/issue/TI-160/ep-2-wl-01-watchlists-matching-engine
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P2, Area/Watchlists, Type/Epic
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-160-ep-2-wl-01-watchlists-matching-engine`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Permettre aux agents acheteurs de créer une watchlist et recevoir des matches quand un deal/listing correspond. (Docs §8.2, §11)

Market value:

* Crée des habitudes + rétention; transforme le Deal Feed en moteur d’alertes. (Docs §5A)

Scope:

* CRUD watchlists (criteria: query/tags/price/geo/distance)
* Matching engine deals ↔ watchlists

Functional anchors:

* Data model Watchlist (Docs §9)
* APIs: `POST /v1/watchlists`, `GET /v1/watchlists`, `GET /v1/watchlists/{id}/matches` (Docs §11)

Dependencies:

* Dépend de EP-0-FND-01 (auth/write)

Definition of Done:

* CRUD complet
* Matching à la création d’un deal (au moins) + event `watchlist.match`
* Telemetry: `watchlist.created`, `watchlist.match`

---

## TI-161 — EP-2-SSE-01 — SSE Stream (alertes temps réel)

**URL:** https://linear.app/ti-max/issue/TI-161/ep-2-sse-01-sse-stream-alertes-temps-reel
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P2, Area/Watchlists, Type/Epic
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-161-ep-2-sse-01-sse-stream-alertes-temps-reel`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

Goal:

* Exposer un flux SSE temps réel pour deals/listings/offers/approvals + watchlist.matches. (Docs §11)

Market value:

* Permet aux agents d’agir vite (buy-side) et aux humains de superviser en live (ops). (Docs §8.2, §12)

Scope:

* Endpoint `GET /v1/events/stream` (SSE)
* Event types: deal/listing/offer/approval/watchlist.match
* UI ops live feed (au moins basique)

Dependencies:

* Dépend de: EP-1-DEAL-01 (events deals), EP-3-LST-01 (events listings)

SLO (MVP):

* Objectif de livraison event: < 2s (best effort)

Definition of Done:

* SSE opérationnel + auth
* Reconnexion client + replay minimal (si retenu)
* Telemetry: `sse.event_sent`

---

## TI-189 — US-2-WL-01 — CRUD watchlists

**URL:** https://linear.app/ti-max/issue/TI-189/us-2-wl-01-crud-watchlists
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P2, Area/Watchlists, Type/Story
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-189-us-2-wl-01-crud-watchlists`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant qu’agent, je crée et gère des watchlists.

Context:

* Parcours acheteur: watchlists + alertes (Doc §8.2)

Acceptance Criteria:

* Given critères `{query, tags, price_max, geo, distance_km}`
* When create
* Then watchlist active

Implementation Notes:

* API: `POST /v1/watchlists`, `GET /v1/watchlists` (Doc §11)
* Data model Watchlist (Doc §9): `watchlist_id`, `agent_id`, `criteria`, `created_at`, `active`

Telemetry (events):

* watchlist.created

Abuse/Security notes:

* Rate limit création; validate critères

Definition of Done:

* CRUD complet + tests

---

## TI-190 — US-2-WL-02 — Matching deals ↔ watchlists

**URL:** https://linear.app/ti-max/issue/TI-190/us-2-wl-02-matching-deals-watchlists
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P2, Area/Watchlists, Type/Story
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-190-us-2-wl-02-matching-deals-watchlists`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant que système, je matche deals et watchlists.

Context:

* Watchlists se nourrissent du Deal Feed (Doc §5A)

Acceptance Criteria:

* Given watchlist active
* When deal créé matchant
* Then match enregistré + event

Implementation Notes:

* Matching simple MVP: query/tags/price/geo/distance
* API: `GET /v1/watchlists/{id}/matches` (Doc §11)
* Event SSE: `watchlist.match`

Telemetry (events):

* watchlist.match

Abuse/Security notes:

* Éviter sur-notification: de-dup + rate limit events

Definition of Done:

* Matching + storage + event + tests

---

## TI-191 — US-2-SSE-01 — /v1/events/stream (SSE)

**URL:** https://linear.app/ti-max/issue/TI-191/us-2-sse-01-v1eventsstream-sse
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/API, Phase/P2, Area/Watchlists, Type/Story
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-191-us-2-sse-01-v1eventsstream-sse`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Doc fonctionnel & valeur marché](<https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968>)

User Story:
En tant que client, je reçois des events en temps réel.

Context:

* SSE stream = alertes + supervision (Doc §11, §12)

Acceptance Criteria:

* Given client connecté SSE
* When deal/listing/offer/approval/watchlist.match
* Then event JSON est streamé rapidement (objectif: <2s)

Implementation Notes:

* API: `GET /v1/events/stream` (Doc §11)
* Event contract stable: `{type, ts, actor, entity_type, entity_id, payload_min}`
* Reconnect: support Last-Event-ID (si possible)

Telemetry (events):

* sse.event_sent

Abuse/Security notes:

* Ne pas streamer PII; masquage

Definition of Done:

* SSE opérationnel + auth + reconnect
* Tests de base + event

---

## TI-192 — US-2-SSE-02 — Ops live feed UI

**URL:** https://linear.app/ti-max/issue/TI-192/us-2-sse-02-ops-live-feed-ui
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/Web, Phase/P2, Area/Console, Type/Story
**Milestone:** Phase 2 — Watchlists
**Git Branch:** `thannous/ti-192-us-2-sse-02-ops-live-feed-ui`

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

User Story:
En tant qu’utilisateur ops, je veux visualiser en live les événements (deals/listings/offers/approvals/watchlist.match) pour superviser et intervenir vite.

Context:

* Console ops live feed (Docs §12)

Acceptance Criteria:

* Given je suis connecté
* When j’ouvre le live feed
* Then je vois les events en temps réel avec: type, timestamp, actor (agent/humain), entity_id, résumé
* When je filtre par type (deal/listing/offer/approval/watchlist.match)
* Then la liste se met à jour sans recharger la page
* When je clique un event
* Then je peux naviguer vers la page détail correspondante (deal/listing/thread/approval)

API/Schema impact:

* Consomme `GET /v1/events/stream` (SSE) (Docs §11)
* Contract event JSON stable (versionné si besoin)

Telemetry (events):

* ops_live_feed.opened

Abuse/Security notes:

* Ne pas afficher de payloads sensibles; masquage PII

Definition of Done:

* Live feed utilisable (auto-scroll, pause)
* Résilient (reconnect SSE)
