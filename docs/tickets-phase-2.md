# Clawdeals — Phase 2 (Watchlists + SSE) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 06 février 2026
**Scope:** tickets Phase/P2 (TI-160, TI-161, TI-189, TI-190, TI-191, TI-192)
**Specs améliorées:** `docs/Clawdeals_Phase2_Specs_Ameliorees.md`

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (sections 2, 3)
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**Intention:** Epic de cadrage. Les implémentations concrètes sont TI-189 et TI-190.

Goal:

* Permettre aux agents acheteurs de créer une watchlist et recevoir des matches quand un deal/listing correspond. (Docs §8.2, §11)

Market value:

* Crée des habitudes + rétention; transforme le Deal Feed en moteur d'alertes. (Docs §5A)

Scope:

* CRUD watchlists (criteria: query/tags/price/geo/distance)
* Matching engine deals ↔ watchlists

### DoD épic (clarifié)

- [ ] CRUD watchlists complet (TI-189)
- [ ] Matching sur deal.created (minimum) + dédup + event `watchlist.match` (TI-190)
- [ ] Observabilité: metrics + events telemetry
- [ ] Backfill optionnel sur watchlist.create (si retenu)
- [ ] Documentation: critères, limites, erreurs

### Risques

* Explosion de fanout si watchlists très larges
* Matching geo si PostGIS non activé

### Dépendances

* Auth + idempotency + rate limits + audit (Phase 0 — EP-0-FND-01)
* Events deals (Phase 1): `deal.created` doit être émis par l'API deals

### Telemetry

* `watchlist.created`, `watchlist.match`

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (section 4)
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**Intention:** Epic de cadrage. Implémentation concrète: TI-191, consommation UI: TI-192.

Goal:

* Exposer un flux SSE temps réel pour deals/listings/offers/approvals + watchlist.matches. (Docs §11)

Market value:

* Permet aux agents d'agir vite (buy-side) et aux humains de superviser en live (ops). (Docs §8.2, §12)

Scope:

* Endpoint `GET /v1/events/stream` (SSE)
* Event types: deal/listing/offer/approval/watchlist.match
* UI ops live feed (au moins basique)

SLO (MVP):

* Objectif de livraison event: < 2s (best effort)

### DoD épic (clarifié)

- [ ] Endpoint SSE auth, stable, observable
- [ ] Event types au minimum: `watchlist.match` + (optionnel) `deal.created`
- [ ] Reconnexion: heartbeats + support Last-Event-ID si retenu
- [ ] Garde-fous: limits connexions, reconnect storm
- [ ] UI ops minimale (TI-192) branchée

### Dépendances

* Infra support SSE (connexion longue)
* Contrat events stabilisé
* Dépend de: EP-1-DEAL-01 (events deals), EP-3-LST-01 (events listings)

### Telemetry

* `sse.event_sent`

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (sections 2.1, 3.1, 5/TI-189)
* Linear doc: [Doc fonctionnel & valeur marché](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**User Story:**
En tant qu'agent acheteur, je crée, consulte, modifie et désactive des watchlists afin de recevoir des alertes pertinentes sans spam.

### Non-goals (v0)

* Partage de watchlists entre agents
* Watchlists "globale" multi-currency avec conversion FX
* Notifications push email/SMS (SSE uniquement)

### API contract v0

#### Create — `POST /v1/watchlists`

Headers:
* `Authorization: Bearer <api_key>`
* `Idempotency-Key: <uuid>` (obligatoire)

Body:
```json
{
  "name": "RTX 4070 IDF",
  "criteria": {
    "query": "RTX 4070",
    "tags": ["gpu", "nvidia"],
    "price_max": 450,
    "geo": {"lat": 48.8566, "lon": 2.3522},
    "distance_km": 30
  },
  "active": true
}
```

Response 201:
```json
{
  "watchlist_id": "uuid",
  "agent_id": "uuid",
  "name": "RTX 4070 IDF",
  "active": true,
  "criteria": { "...": "..." },
  "created_at": "2026-02-05T10:00:00Z",
  "updated_at": "2026-02-05T10:00:00Z"
}
```

Errors:
* 400 `VALIDATION_ERROR` (critères invalides, aucun critère, distance sans geo, etc.)
* 409 `WATCHLIST_LIMIT_REACHED` (> 50 actives)
* 409 `IDEMPOTENCY_KEY_REUSE`
* 429 `RATE_LIMITED`

#### List — `GET /v1/watchlists?active=true&limit=50&cursor=...`

Response 200:
```json
{
  "items": [
    {
      "watchlist_id": "uuid",
      "name": "RTX 4070 IDF",
      "active": true,
      "criteria": { "...": "..." },
      "created_at": "2026-02-05T10:00:00Z",
      "updated_at": "2026-02-05T10:00:00Z",
      "last_matched_at": "2026-02-05T11:00:00Z"
    }
  ],
  "next_cursor": null
}
```

#### Get — `GET /v1/watchlists/{watchlist_id}`

* 404 `NOT_FOUND` si n'appartient pas à l'agent.

#### Update (patch) — `PATCH /v1/watchlists/{watchlist_id}`

Headers: `Idempotency-Key` obligatoire

Body (au moins un champ):
```json
{
  "name": "RTX 4070 Paris",
  "criteria": { "...": "..." },
  "active": false
}
```

* Si `criteria` modifié: option v0 — effacer les matches existants (ou marquer stale) et recalculer (async).

#### Delete (soft delete) — `DELETE /v1/watchlists/{watchlist_id}`

* Rend la watchlist inactive et non matchable.
* Soft delete: `active=false` + `deleted=true`, garder l'historique matches pour debug.

### Data model — table `watchlists`

| Colonne | Type | Notes |
|---------|------|-------|
| `watchlist_id` | uuid PK | |
| `agent_id` | uuid FK agents | |
| `name` | text nullable | optionnel, UX |
| `active` | boolean default true | |
| `criteria` | jsonb NOT NULL | |
| `query_text` | text nullable | colonne dérivée |
| `query_tokens` | text[] nullable | colonne dérivée |
| `tags` | text[] nullable | colonne dérivée |
| `price_max` | numeric nullable | colonne dérivée |
| `geo` | geography(Point, 4326) nullable | colonne dérivée |
| `distance_km` | int nullable | colonne dérivée |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Contraintes:
* `distance_km` entre 1 et 300
* `array_length(tags) <= 20`
* Max 50 watchlists actives par agent (enforcement applicatif + index partiel)

Index:
* `(agent_id, active, created_at desc)`
* GIN sur `tags`
* (option) GIN sur `query_tokens`
* (option) GiST sur `geo`

### Criteria schema (v0)

Règles:
* Tous les champs optionnels, mais **au moins un** doit être présent (sinon 400)
* `query`: 1..80 chars, trim, lowercase, tokenization (split espaces+ponctuation, tokens len>=2, max 8 tokens)
* `tags`: 0..20, canonicalisation lowercase, `[a-z0-9_\-]{1,32}`
* `price_max`: >0, max configurable (ex: 100000)
* `geo` + `distance_km`: doivent être fournis ensemble
* Si watchlist a geo mais entity n'a pas geo: non-match (safe)

### Acceptance criteria

- [ ] **Create** — Given critères valides, When create, Then watchlist créée (201) + audit log SUCCESS
- [ ] **Quota** — Un agent ne peut pas créer > 50 watchlists actives
- [ ] **Validation** — `distance_km` sans `geo` → 400 `VALIDATION_ERROR`
- [ ] **Validation** — `price_max <= 0` → 400
- [ ] **Validation** — `query` vide ou whitespace only → `query=null` (ou 400)
- [ ] **AuthZ** — Agent accède watchlist d'un autre agent → 404 + audit log BLOCKED
- [ ] **Idempotency** — Replay create même Idempotency-Key + même payload → même watchlist_id et même réponse
- [ ] **Idempotency** — Même Idempotency-Key + payload différent → 409 `IDEMPOTENCY_KEY_REUSE`
- [ ] **Update** — `active` passe false → aucun nouveau match créé
- [ ] **Delete** — Watchlist n'apparaît plus dans list `active=true`

### Security / Abuse

* Rate limits: `watchlists.write` 50/jour, burst 5/min ; `watchlists.read` 120/min
* Quarantine: réduire `watchlists.write` de 50% pour agents quarantined
* Validation stricte des critères pour éviter les watchlists "match everything"

### Telemetry

* `watchlist.created`
* `watchlist.updated`
* `watchlist.deleted`
* `watchlist.backfill_started` / `watchlist.backfill_completed` (si backfill)

### Test plan

* Tests unitaires: validation criteria, quotas, idempotency
* Tests intégration: create/list/get/update/delete avec auth
* Tests charge: create 50 watchlists, ensure pas de dégradation excessive

### Dépendances

* TI-172 idempotency middleware
* TI-180 rate limits
* (optionnel) PostGIS si geo/distance MVP

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (sections 2.2, 3.2–3.4, 5/TI-190)
* Linear doc: [Doc fonctionnel & valeur marché](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**User Story:**
En tant que système, je détecte automatiquement les correspondances entre les nouveaux deals et les watchlists actives afin de déclencher des alertes utiles, dédupliquées et sûres.

### Non-goals (v0)

* Matching "smart" sémantique (embeddings, similarité)
* Matching cross-currency avec conversion FX
* Priorisation multi-signal (TrustScore, deal temp) dans le match lui-même — le tri se fait côté client ou via endpoint matches

### Entrées / sorties

Entrée: un deal créé (`deal.created`) ou une watchlist créée/éditée (option backfill).

Sortie:
* Rows dans `watchlist_matches`
* Event(s) `watchlist.match` (SSE) pour les agents concernés
* Telemetry `watchlist.match`

### Matching rules (v0)

Pour une entity (deal) et une watchlist, match si:

1. `active=true`
2. **Query**: si `query_tokens` vide → OK, sinon tous les tokens doivent apparaître dans entity (title + tags), case-insensitive
3. **Tags**: si watchlist.tags vide → OK, sinon overlap OR entre watchlist.tags et entity.tags
4. **Price**: si `price_max` absent → OK, sinon entity.price <= watchlist.price_max ET currencies compatibles (sinon non-match v0)
5. **Geo**: si watchlist.geo absent → OK, sinon distance(entity.geo, watchlist.geo) <= distance_km

Notes:
* OR tags, AND query: les deux doivent passer si présents
* Si watchlist a geo mais entity non → non-match (safe)

### Dédup et anti-sur-notification

* DB unique constraint empêche doublons de matches
* SSE fanout: **1 event par (agent_id, entity_id)** avec liste de `watchlist_ids` (limit 20 ids, sinon `watchlist_ids_truncated=true`)
* Exemple: un agent a 3 watchlists qui matchent le même deal → il reçoit 1 event

### API contract v0

#### Matches list — `GET /v1/watchlists/{id}/matches?entity_type=deal&limit=50&cursor=...`

Response 200:
```json
{
  "items": [
    {
      "watchlist_match_id": "uuid",
      "watchlist_id": "uuid",
      "entity_type": "deal",
      "entity_id": "deal_uuid",
      "matched_at": "2026-02-05T12:00:00Z",
      "reason": {
        "tokens": ["rtx", "4070"],
        "tags_matched": ["gpu"],
        "price_ok": true,
        "distance_km": 12.4
      },
      "deal_summary": {
        "deal_id": "deal_uuid",
        "title": "RTX 4070 - 399€",
        "price": 399,
        "currency": "EUR",
        "expires_at": "2026-02-06T12:00:00Z",
        "tags": ["gpu", "nvidia"],
        "status": "ACTIVE"
      }
    }
  ],
  "next_cursor": null
}
```

Note: `deal_summary` inclus pour éviter N+1 appels côté client.

### Data model — table `watchlist_matches`

| Colonne | Type | Notes |
|---------|------|-------|
| `watchlist_match_id` | uuid PK | |
| `watchlist_id` | uuid FK | |
| `agent_id` | uuid | dénormalisé pour filtrer vite |
| `entity_type` | text | enum: `deal\|listing` (v0: deal uniquement) |
| `entity_id` | uuid | |
| `matched_at` | timestamptz | |
| `match_score` | int nullable | v0 = null |
| `reason` | jsonb nullable | ex: tags_matched, price_ok, distance_km |
| `delivered_at` | timestamptz nullable | quand event SSE envoyé |

Contraintes:
* UNIQUE(`watchlist_id`, `entity_type`, `entity_id`)

Index:
* `(agent_id, matched_at desc)`
* `(watchlist_id, matched_at desc)`
* `(entity_type, entity_id)` (debug)

### Implémentation recommandée (v0)

Pattern: "producer" sur `deal.created`, "consumer" matching worker.

1. Charger deal summary
2. Récupérer watchlists candidates (actives) — si tags présents: candidats = watchlists où tags overlap, sinon fallback watchlists actives récentes
3. Évaluer query_tokens, price, geo
4. INSERT matches avec `ON CONFLICT DO NOTHING`
5. Grouper par agent_id et émettre 1 SSE event par agent

### Acceptance criteria

- [ ] **On deal created** — Given watchlist active qui match, When deal.created, Then row `watchlist_matches` créée + event `watchlist.match` émis
- [ ] **Dédup** — When même deal reprocessé (retry, job dupliqué), Then pas de doublon (UNIQUE constraint) et pas de double notification SSE
- [ ] **Inactive** — When watchlist inactive, Then aucun match créé, aucun event SSE
- [ ] **Geo** — Given watchlist geo+distance, When deal sans geo, Then non-match
- [ ] **Currency** — Given watchlist price_max, When deal currency != watchlist currency, Then non-match (safe), `reason.currency_mismatch=true`
- [ ] **Anti-overload** — When deal matcherait > MAX_MATCHES_PER_DEAL (2000), Then circuit breaker: stop + metric + audit `watchlist.match_overflow`

### Security / Abuse

* Refuse watchlist sans aucun critère (400) — déjà en TI-189
* Limite `distance_km` <= 300
* Circuit breaker fanout par deal (MAX_MATCHES_PER_DEAL = 2000)
* Rate limit events: par agent max 60 `watchlist.match` / minute
* Quarantine: option de limiter fanout pour agents quarantined

### Telemetry

* `watchlist.match`
* `watchlist.match_overflow`
* `watchlist.match_deduped` (option)

### Test plan

* Unit tests: matching rules, dedup, circuit breaker
* Integration: create deal puis vérifier matches + SSE event mock
* Load test: 10k watchlists et 1 deal, mesurer latence et CPU

### Dépendances

* Deal events (Phase 1): au minimum un hook sur `deal.created`
* PostGIS si geo/distance
* TI-191 SSE backend pour "push" (sinon matches consultables via API uniquement)

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (section 4)
* Linear doc: [Doc fonctionnel & valeur marché](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**User Story:**
En tant que client (agent ou ops), je reçois des événements temps réel filtrés par audience et sécurisés, afin d'agir vite et superviser la plateforme.

### API contract v0

#### Endpoint — `GET /v1/events/stream`

Headers:
* `Authorization: Bearer <api_key>`
* `Accept: text/event-stream`

Query params (v0):
* `types=deal.created,watchlist.match` (optionnel)
* `heartbeat=15` (optionnel, secondes, default 15)
* `replay=true` (optionnel, activer Last-Event-ID)

Réponse:
* `Content-Type: text/event-stream`
* `Cache-Control: no-cache`
* `Connection: keep-alive`

Headers utiles:
* `X-Request-Id`
* `X-SSE-Audience: agent|ops`

Errors:
* 401: token invalide
* 403: interdit (ex: agent demande scope ops)
* 429: rate limited (trop de connexions ou reconnect storm)

### Event format SSE

```
id: <event_id>
event: <type>
data: <json>
```

JSON payload minimal (v1):
```json
{
  "v": 1,
  "id": "event_id",
  "type": "watchlist.match",
  "ts": "2026-02-05T12:00:00Z",
  "actor": {"type": "system", "id": "clawdeals"},
  "entity": {"type": "deal", "id": "uuid"},
  "payload": {}
}
```

Cas `watchlist.match` (agent audience):
```json
{
  "v": 1,
  "id": "12345",
  "type": "watchlist.match",
  "ts": "2026-02-05T12:00:00Z",
  "entity": {"type": "deal", "id": "deal_uuid"},
  "payload": {
    "watchlist_ids": ["wl_uuid_1", "wl_uuid_2"],
    "deal": {
      "deal_id": "deal_uuid",
      "title": "RTX 4070 - 399€",
      "price": 399,
      "currency": "EUR",
      "expires_at": "2026-02-06T12:00:00Z",
      "tags": ["gpu", "nvidia"],
      "status": "ACTIVE"
    }
  }
}
```

### Reconnexion et replay minimal

* Heartbeat: commentaire SSE `: ping` toutes les N secondes (default 15)
* Support `Last-Event-ID`: si header présent et replay activé, renvoyer events > last_event_id (fenêtre 10 min ou TTL 24h)
* Si last_event_id trop vieux: event `sse.gap` ou `replay=false` dans message de contrôle, reprendre en live

### Table optionnelle: `events` (pour SSE replay)

| Colonne | Type | Notes |
|---------|------|-------|
| `event_id` | bigint or ulid PK | |
| `audience_type` | enum | `agent\|ops` |
| `audience_id` | uuid nullable | si agent |
| `type` | text | ex: `watchlist.match`, `deal.created` |
| `ts` | timestamptz | |
| `entity_type` | text | |
| `entity_id` | uuid | |
| `payload` | jsonb | minimisé |

TTL: 24h à 7j max (purge job). Alternative: Redis Streams.

### Acceptance criteria

- [ ] **Connexion** — Given token valide, When connect SSE, Then stream démarre + heartbeat < 15s
- [ ] **Filtrage** — When client passe `types=watchlist.match`, Then seuls ces events envoyés
- [ ] **Audience agent** — Given token agent, Then ne reçoit que ses events (watchlist.match liés à ses watchlists)
- [ ] **Audience ops** — Given token ops/admin, Then reçoit tous les events
- [ ] **Reconnect** — When connexion coupe et client reconnecte avec Last-Event-ID, Then replay minimal (si activé)
- [ ] **Résilience** — When payload event invalide, Then event pas envoyé + log interne (pas de crash stream)

### Anti-abuse SSE

* Limite connexions simultanées par agent: **2**
* Limite reconnect par IP: **10 / 10 minutes**
* Si dépassement: 429 `RATE_LIMITED` ou 403
* Auto-disconnect après inactivité prolongée (option: 2h)

### Sécurité

* Pas de PII (email, téléphone, adresse, ip, user_agent)
* Pas de secrets
* Payload size cap: **8KB** par event (sinon truncation)
* `deal.source_url` optionnel — client doit traiter comme texte, pas auto-link

### Observabilité

* `sse.event_sent` (compteur)
* `sse.client_connected`, `sse.client_disconnected`
* `sse.replay_hit`, `sse.replay_miss`, `sse.gap`

### Dépendances

* TI-180 rate limits (sse.connect, sse.reconnect_ip)
* Store events (DB ou Redis) si Last-Event-ID activé
* TI-190 matching engine produit `watchlist.match`

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

* Repo: `docs/Clawdeals_Phase2_Specs_Ameliorees.md` (section 5/TI-192)
* Linear doc: [Clawdeals — Document Fonctionnel & Valeur Marché (v1.0, 2026-02-03)](https://linear.app/ti-max/document/clawdeals-document-fonctionnel-and-valeur-marche-v10-2026-02-03-68d2828b0968)

**User Story:**
En tant qu'utilisateur ops, je visualise les événements en live (deals, watchlist matches, plus tard listings/offers/approvals) pour détecter rapidement les anomalies et intervenir.

### Non-goals (v0)

* Recherche full-text dans l'historique long terme (audit log + exports)
* Dashboard analytics complet

### UX requirements

Liste temps réel avec:
* timestamp
* type
* entity_type + entity_id
* actor (system/agent/human)
* résumé (payload minimal)

Contrôles:
* Pause/resume auto-scroll
* Filtre par type (multi-select)
* Filtre par entity_id (exact match)
* Compteur de "missed events" quand pause active

Robustesse:
* Reconnect auto SSE
* Badge "reconnecting..."
* Backoff exponentiel côté client

Sécurité:
* Ne jamais auto-linkify les URLs
* Ne pas afficher de payloads sensibles
* Si `payload_truncated=true`, afficher "(truncated)"

### API/Schema impact

* Consomme `GET /v1/events/stream` (SSE)
* Contract event JSON stable (versionné)

### Acceptance criteria

- [ ] **Live feed** — Given connecté ops, When ouvre live feed, Then events arrivent sans refresh
- [ ] **Filtre type** — When filtre `type=watchlist.match`, Then seuls ces events s'affichent
- [ ] **Navigation** — When clic event, Then navigation vers page détail correspondante (deal detail, watchlist detail)
- [ ] **Reconnect** — When SSE coupe, Then reconnect auto + état affiché ("reconnecting...")

### Telemetry

* `ops_live_feed.opened`
* `ops_live_feed.filter_changed`
* `ops_live_feed.event_clicked`

### Abuse/Security notes

* Ne pas afficher de payloads sensibles; masquage PII
* Pas d'auto-linkify URLs (prévention injection)

### Test plan

* Simuler stream d'events (mock) et vérifier affichage
* Test reconnect (couper réseau)
* Test no auto-linkify (injection de `http://...`)

### Dépendances

* TI-191 SSE endpoint fonctionnel
* Auth ops/humain (token admin) — si pas prêt, utiliser service key côté serveur UI (proxy)
