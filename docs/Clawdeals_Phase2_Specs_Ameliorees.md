# Clawdeals Phase 2 (Watchlists + SSE) - Specs améliorées (v1.1)

Date: 05 février 2026  
Scope: Phase 2 (P2) - Watchlists, matching, SSE stream, Ops live feed  
Tickets: TI-160, TI-161, TI-189, TI-190, TI-191, TI-192

Objectif produit (rappel)
- Permettre aux agents acheteurs de créer des watchlists et d'être alertés quand un deal (puis listing) correspond.
- Activer des workflows "agent-first" temps réel via un flux SSE, sans exposer de données sensibles.
- Donner aux ops une visibilité live sur ce qui se passe (console).

---

## 0) Résumé d'analyse (vos 5 attentes)

### 0.1 Validation fonctionnelle (AC clairs et complets ?)
Constats sur les tickets Phase 2 actuels
- Les AC couvrent bien le "happy path" (CRUD, match on deal created, SSE connecté) mais manquent de détails sur:
  - le comportement de déduplication (matchs et notifications)
  - la pagination (matches, watchlists)
  - les statuts (watchlist active/inactive, soft delete)
  - les cas limites (deal sans geo, watchlist avec geo, currency mismatch)
  - la stratégie de reconnexion SSE (heartbeats, Last-Event-ID, replay)
- Les tickets épics (TI-160, TI-161) listent le scope mais ne verrouillent pas les invariants.

Ce document comble ces zones grises avec des choix v0, testables.

### 0.2 Faisabilité technique (API contracts + data models réalistes ?)
Oui, réaliste en v0 si:
- Postgres (Supabase) reste source of truth, avec PostGIS activé si geo/distance est MVP.
- Un composant "éphémère" existe (Redis ou équivalent) pour:
  - connexions SSE (compteurs, anti-reconnect storm)
  - fanout léger / pubsub (optionnel) ou au minimum des locks et caches
- L'infra qui héberge l'API supporte des connexions longues (SSE). Si vous êtes 100% serverless avec timeouts stricts, SSE devient un risque (voir section 4.2).

### 0.3 Sécurité (anti-abuse suffisant ?)
Base saine, à renforcer pour éviter 3 classes d'abus:
1) Spam création watchlists (ressources + matching coûteux)  
2) Spam notifications (SSE) via critères trop larges  
3) Exfiltration (SSE) via payload trop riche ou non filtré par audience

Mitigations ajoutées:
- Quotas: max watchlists actives par agent + rate limit create/update.
- Critères validés et bornés (distance max, tags max, query max).
- Dédup forte via contraintes DB (watchlist_id, entity_type, entity_id).
- Fanout contrôlé: 1 event SSE par (agent_id, deal_id), pas 1 event par watchlist.
- SSE: auth + audience filtering + no PII + connexion limits + heartbeats.

### 0.4 Dépendances (blocages/manquants)
Dépendances explicites manquantes dans les tickets:
- Source d'événements deals: le backend doit émettre un event interne sur deal.created (Phase 1), sinon matching et SSE ne peuvent pas fonctionner.
- Contrat d'event: sans "event_id" stable, la reconnexion Last-Event-ID reste floue.
- Auth ops/humain: l'Ops live feed nécessite un token admin/ops distinct (au moins minimal), sinon vous ne pourrez pas afficher "tous les événements".

### 0.5 Parallélisable (tickets en parallèle)
4 workstreams possibles:
- A Watchlists API: TI-189 (CRUD) + migrations
- B Matching: TI-190 (engine + matches storage + event emission)
- C SSE backend: TI-191 (stream) + store minimal / anti-abuse
- D Console ops UI: TI-192 (live feed) en parallèle dès que le contrat SSE est stabilisé

Les épics (TI-160, TI-161) servent de regroupement, mais le dev se fait sur les stories.

---

## 1) Conventions transverses (Phase 0 et v0 API)

Ces conventions sont alignées avec les fondations: auth par API key, idempotency, audit log, rate limits.

### 1.1 Auth
- Header: `Authorization: Bearer <api_key>`
- Un agent ne voit que ses ressources (watchlists et matches) sauf si token ops/admin.

### 1.2 Idempotency (write endpoints)
- Header obligatoire sur tous les endpoints write: `Idempotency-Key: <string>`
- Replays: même réponse pour même clé + même payload.
- Collision: 409 `IDEMPOTENCY_KEY_REUSE`.

### 1.3 Error shape (v0)
```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "human readable",
    "details": {}
  }
}
```

### 1.4 Pagination (v0)
- Paramètres: `limit` (default 50, max 200), `cursor` (opaque)
- Réponse:
```json
{
  "items": [],
  "next_cursor": "string|null"
}
```

### 1.5 Audit log et telemetry
- Chaque write: audit log (SUCCESS/FAILURE/BLOCKED)
- Events telemetry recommandés: `watchlist.created`, `watchlist.updated`, `watchlist.match`, `sse.event_sent`, `ops_live_feed.opened`

### 1.6 PII et redaction
- SSE et watchlist.match: ne jamais inclure email, téléphone, adresse, ip, user_agent.
- Les URL externes peuvent être transmises mais ne doivent pas être "cliquables" automatiquement côté console (côté UI: no auto-linkify).

---

## 2) Data model v0 (Postgres)

### 2.1 Table: watchlists
Objectif: critères query/tags/price/geo/distance en JSON, mais avec colonnes dérivées pour indexation et matching.

Champs recommandés
- `watchlist_id` uuid PK
- `agent_id` uuid (FK agents)
- `name` text nullable (optionnel, UX)
- `active` boolean default true
- `criteria` jsonb NOT NULL
- Colonnes dérivées (optionnel mais recommandé):
  - `query_text` text nullable
  - `query_tokens` text[] nullable
  - `tags` text[] nullable
  - `price_max` numeric nullable
  - `geo` geography(Point, 4326) nullable
  - `distance_km` int nullable
- `created_at`, `updated_at`

Contraintes
- `distance_km` entre 1 et 300 (config)
- `array_length(tags) <= 20`
- max 50 watchlists actives par agent (enforcement applicatif + index partiel)
- Index:
  - `(agent_id, active, created_at desc)`
  - GIN sur `tags`
  - (option) GIN sur `query_tokens`
  - (option) GiST sur `geo`

### 2.2 Table: watchlist_matches
Objectif: historiser les correspondances et dédupliquer.

Champs recommandés
- `watchlist_match_id` uuid PK
- `watchlist_id` uuid FK
- `agent_id` uuid (dénormalisé pour filtrer vite)
- `entity_type` text enum: `deal|listing` (v0: deal uniquement)
- `entity_id` uuid
- `matched_at` timestamp
- `match_score` int nullable (optionnel, v0 = null)
- `reason` jsonb nullable (ex: tags_matched, price_ok, distance_km)
- `delivered_at` timestamp nullable (quand un event SSE a été envoyé)

Contraintes
- UNIQUE(`watchlist_id`, `entity_type`, `entity_id`) pour empêcher doublons.
- Index:
  - `(agent_id, matched_at desc)`
  - `(watchlist_id, matched_at desc)`
  - `(entity_type, entity_id)` (utile pour debug)

### 2.3 Table optionnelle: events (pour SSE replay minimal)
Option v0 recommandée pour Last-Event-ID.
- `event_id` bigint or ulid PK
- `audience_type` enum: `agent|ops`
- `audience_id` uuid nullable (si agent)
- `type` text (ex: `watchlist.match`, `deal.created`)
- `ts` timestamp
- `entity_type`, `entity_id`
- `payload` jsonb (minimisé)
- TTL: 24h à 7j max (purge job)

Alternative: Redis Streams si vous préférez ne pas écrire en DB.

---

## 3) Spécification fonctionnelle: Watchlists et Matching

### 3.1 Criteria schema (v0)
Watchlist.criteria JSON:
```json
{
  "query": "RTX 4070",
  "tags": ["gpu", "nvidia"],
  "price_max": 450,
  "geo": {"lat": 48.8566, "lon": 2.3522},
  "distance_km": 30
}
```

Règles (v0)
- Tous les champs sont optionnels, mais au moins un doit être présent (sinon 400).
- `query`:
  - 1..80 caractères, trim, normalisé lowercase.
  - Tokenization: split sur espaces et ponctuation, garder tokens len>=2, max 8 tokens.
- `tags`: 0..20, canonicalisation: lowercase, `[a-z0-9_\-]{1,32}`
- `price_max`: >0, max configurable (ex: 100000)
- `geo` + `distance_km`: doivent être fournis ensemble.
- Si watchlist a geo mais entity n'a pas geo: non-match (safe).

### 3.2 Matching rules (v0)
Pour une entity (deal ou listing) et une watchlist, match si:
- `active=true`
- Query match:
  - si `query_tokens` est vide: OK
  - sinon: tous les tokens doivent apparaître dans les tokens de l'entity (title + tags), comparaison case-insensitive.
- Tags match:
  - si watchlist.tags vide: OK
  - sinon: overlap (OR) entre watchlist.tags et entity.tags
- Price match:
  - si watchlist.price_max absent: OK
  - sinon: entity.price <= watchlist.price_max ET currencies compatibles (sinon non-match, v0)
- Geo match:
  - si watchlist.geo absent: OK
  - sinon: distance(entity.geo, watchlist.geo) <= distance_km

Notes
- OR tags, AND query: tags et query s'additionnent (les deux doivent passer si présents).
- Ces règles sont simples, explicables, et suffisantes pour v0.

### 3.3 Déduplication et anti-sur-notification
- DB unique constraint empêche doublons de matches.
- SSE fanout:
  - 1 event par (agent_id, entity_id) avec une liste de `watchlist_ids` (limit 20 ids, sinon `watchlist_ids_truncated=true`).
  - Exemple: un agent a 3 watchlists qui matchent le même deal, il reçoit 1 event.

### 3.4 Backfill (option v0)
- À la création d'une watchlist:
  - backfill sur les 7 derniers jours de deals ACTIVE, limit 200 matches.
  - si backfill trop coûteux: le faire async via job, mais renvoyer la watchlist immédiatement.

---

## 4) Spécification technique: SSE

### 4.1 Endpoint
`GET /v1/events/stream`

Headers
- `Authorization: Bearer <api_key>`
- `Accept: text/event-stream`

Query params (v0)
- `types=deal.created,watchlist.match` (optionnel)
- `heartbeat=15` (optionnel, secondes, default 15)
- (option) `replay=true` pour activer Last-Event-ID

Réponse
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

### 4.2 Contrat d'event (v1)
SSE framing
```
id: <event_id>
event: <type>
data: <json>
```

JSON payload minimal (v1)
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

Cas watchlist.match (agent audience)
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

Règles
- Payload minimal, pas de PII.
- `deal.source_url` optionnel. Si inclus, le client doit le traiter comme texte, pas auto-link.
- Si `types` param présent: filtrer côté serveur.

### 4.3 Reconnexion et replay minimal
Objectif MVP: expérience robuste sans complexité extrême.

- Heartbeat: envoyer un commentaire SSE `: ping` toutes les N secondes (default 15).
- Support `Last-Event-ID`:
  - Si header présent et replay activé, renvoyer les events > last_event_id depuis le store (DB/Redis) sur une fenêtre courte (ex: 10 minutes ou TTL 24h).
  - Si last_event_id trop vieux: envoyer un event `sse.gap` ou un champ `replay=false` dans un premier message de contrôle, et reprendre en live.

### 4.4 Anti-abuse SSE
- Limite connexions simultanées par agent: 2
- Limite reconnect par IP: 10 / 10 minutes
- Si dépassement: 429 `RATE_LIMITED` ou 403 selon policy
- Auto-disconnect après inactivité prolongée (option, ex: 2h) pour libérer ressources

---

## 5) Tickets améliorés (Phase 2)

## TI-160 - EP-2-WL-01 - Watchlists + Matching Engine

### Intention
Epic de cadrage. Les implémentations concrètes sont TI-189 et TI-190.

### DoD épic (clarifié)
- CRUD watchlists complet (TI-189)
- Matching sur deal.created (minimum) + dédup + event watchlist.match (TI-190)
- Observabilité: metrics + events telemetry
- Backfill optionnel sur watchlist.create (si retenu)
- Documentation: critères, limites, erreurs

### Risques
- Explosion de fanout si watchlists très larges.
- Matching geo si PostGIS non activé.

### Dépendances
- Auth + idempotency + rate limits + audit (Phase 0)
- Events deals (Phase 1): deal.created doit être émis par l'API deals

---

## TI-189 - US-2-WL-01 - CRUD watchlists (amélioré)

### User story (reformulée)
En tant qu'agent acheteur, je crée, consulte, modifie et désactive des watchlists afin de recevoir des alertes pertinentes sans spam.

### Non-goals (v0)
- Partage de watchlists entre agents
- Watchlists "globale" multi-currency avec conversion FX
- Notifications push email/SMS (SSE uniquement)

### API contract v0

#### Create
`POST /v1/watchlists`

Headers
- `Authorization: Bearer <api_key>`
- `Idempotency-Key: <uuid>` (obligatoire)

Body
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

Response 201
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

Errors
- 400 `VALIDATION_ERROR` (critères invalides, aucun critère, distance sans geo, etc.)
- 409 `WATCHLIST_LIMIT_REACHED` (ex: > 50 actives)
- 409 `IDEMPOTENCY_KEY_REUSE`
- 429 `RATE_LIMITED`

#### List
`GET /v1/watchlists?active=true&limit=50&cursor=...`

Response 200
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

#### Get
`GET /v1/watchlists/{watchlist_id}`

- 404 `NOT_FOUND` si n'appartient pas à l'agent.

#### Update (patch)
`PATCH /v1/watchlists/{watchlist_id}`

Headers: Idempotency-Key obligatoire

Body (au moins un champ)
```json
{
  "name": "RTX 4070 Paris",
  "criteria": { "...": "..." },
  "active": false
}
```

- Si `criteria` modifié: option v0 recommandée:
  - effacer les matches existants (ou marquer stale) et recalculer (async).
  - alternative: conserver et n'ajouter que nouveaux matches. Choisir et documenter.

#### Delete (soft delete recommandé)
`DELETE /v1/watchlists/{watchlist_id}`

- Doit rendre la watchlist inactive et non matchable.
- Soft delete:
  - `deleted_at` (option) ou `active=false` + `deleted=true`
  - garder l'historique matches pour debug pendant une fenêtre.

### Acceptance criteria (complétés)
- Create
  - Given critères valides
  - When create
  - Then watchlist créée (201) et audit log SUCCESS
  - And un agent ne peut pas créer > 50 watchlists actives
- Validation
  - When `distance_km` sans `geo`
  - Then 400 VALIDATION_ERROR
  - When `price_max <= 0`
  - Then 400
  - When `query` vide ou whitespace only
  - Then `query=null` (ou 400, choisir 1 règle et la tester)
- AuthZ
  - When un agent tente d'accéder à une watchlist d'un autre agent
  - Then 404 (ou 403) et audit log BLOCKED
- Idempotency
  - When replay create avec même Idempotency-Key et même payload
  - Then même watchlist_id et même réponse
  - When même Idempotency-Key mais payload différent
  - Then 409 IDEMPOTENCY_KEY_REUSE
- Update
  - When active passe false
  - Then aucun nouveau match n'est créé pour cette watchlist
- Delete
  - When delete
  - Then watchlist n'apparaît plus dans list active=true

### Security / Abuse
- Rate limits (suggestion)
  - `watchlists.write`: 50 / jour (déjà dans Phase 0 rate limits), burst 5 / min
  - `watchlists.read`: 120 / min
- Quarantine: pas nécessaire de réduire les limites en Phase 2, mais recommandé de réduire `watchlists.write` de 50% pour agents quarantined.
- Validation stricte des critères pour éviter les watchlists "match everything".

### Telemetry
- `watchlist.created`
- `watchlist.updated`
- `watchlist.deleted` (si soft delete)
- `watchlist.backfill_started` / `watchlist.backfill_completed` (si backfill)

### Test plan (additif)
- Tests unitaires: validation criteria, quotas, idempotency
- Tests intégration: create/list/get/update/delete avec auth
- Tests charge: create 50 watchlists, ensure pas de dégradation excessive

### Dépendances
- TI-172 idempotency middleware
- TI-180 rate limits
- (optionnel) PostGIS si geo/distance MVP

---

## TI-190 - US-2-WL-02 - Matching deals ↔ watchlists (amélioré)

### User story (reformulée)
En tant que système, je détecte automatiquement les correspondances entre les nouveaux deals et les watchlists actives afin de déclencher des alertes utiles, dédupliquées et sûres.

### Non-goals (v0)
- Matching "smart" sémantique (embeddings, similarité)
- Matching cross-currency avec conversion FX
- Priorisation multi-signal (TrustScore, deal temp) dans le match lui-même
  - Le tri se fait côté client ou via endpoint matches

### Entrées / sorties
Entrée: un deal créé (deal.created) ou une watchlist créée/éditée (option backfill).  
Sortie:
- rows dans `watchlist_matches`
- event(s) `watchlist.match` (SSE) pour les agents concernés
- telemetry `watchlist.match`

### API contract v0

#### Matches list
`GET /v1/watchlists/{id}/matches?entity_type=deal&limit=50&cursor=...`

Response 200
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

Notes
- Inclure un `deal_summary` pour éviter N+1 appels côté client.
- Si entity_type != deal (ex listing): renvoyer summary adapté plus tard (Phase 3).

### Acceptance criteria (complétés)
- On deal created
  - Given une watchlist active qui match le deal
  - When deal.created
  - Then une row `watchlist_matches` est créée
  - And un event `watchlist.match` est émis (pour l'agent owner de la watchlist)
- Dédup
  - When le même deal est reprocessé (retry, job dupliqué)
  - Then pas de doublon (UNIQUE constraint) et pas de double notification SSE
- Respect du scope
  - When une watchlist est inactive
  - Then aucun match n'est créé et aucun event SSE n'est envoyé
- Cas geo
  - Given watchlist a geo + distance
  - When deal n'a pas geo
  - Then non-match
- Cas currency
  - Given watchlist a price_max
  - When deal currency != watchlist currency (ou != EUR v0)
  - Then non-match (safe), et `reason.currency_mismatch=true` si vous voulez debug
- Anti-overload
  - When un deal matcherait > MAX_MATCHES_PER_DEAL (ex: 2000)
  - Then le système déclenche un circuit breaker: stop processing + metric + audit/telemetry `watchlist.match_overflow`

### Implémentation recommandée (v0)
- Pattern: "producer" sur deal.created, "consumer" matching worker.
- v0 simple: dans la transaction de création deal, publier un job (table jobs ou queue).
- Worker:
  1. Charger deal summary
  2. Récupérer watchlists candidates (actives)
     - si tags présents: candidats = watchlists où tags overlap
     - sinon: candidats = watchlists actives récentes (fallback)
  3. Évaluer query_tokens, price, geo
  4. INSERT matches avec ON CONFLICT DO NOTHING
  5. Grouper par agent_id et émettre 1 SSE event par agent

### Security / Abuse
- Empêcher watchlists "match everything":
  - refuse (400) si watchlist n'a ni query ni tags ni price_max ni geo (déjà en TI-189)
  - limite distance_km (ex: <= 300)
  - limite "match fanout" par deal (circuit breaker)
- Rate limit events:
  - par agent: max 60 watchlist.match / minute (au-delà, regrouper en batch `watchlist.match_batch` ou dégrader)
- Quarantine:
  - Si un agent est quarantined, ses watchlists existent mais vous pouvez limiter leur "fanout" (option).

### Telemetry
- `watchlist.match`
- `watchlist.match_overflow`
- `watchlist.match_deduped` (option)

### Test plan (additif)
- Unit tests: matching rules, dedup, circuit breaker
- Integration: create deal puis vérifier matches + SSE event mock
- Load test: 10k watchlists et 1 deal, mesurer latence et CPU

### Dépendances
- Deal events (Phase 1): au minimum un hook sur deal.created
- PostGIS si geo/distance
- SSE backend (TI-191) pour "push"; sinon matches consultables via API uniquement

---

## TI-161 - EP-2-SSE-01 - SSE Stream (alertes temps réel)

### Intention
Epic de cadrage. Implémentation concrète: TI-191, consommation UI: TI-192.

### DoD épic (clarifié)
- Endpoint SSE auth, stable, observable
- Event types au minimum:
  - `watchlist.match`
  - (optionnel) `deal.created` (utile pour ops)
- Reconnexion: heartbeats + support Last-Event-ID si retenu
- Garde-fous: limits connexions, reconnect storm
- UI ops minimale (TI-192) branchée

### Dépendances
- Infra support SSE (connexion longue)
- Contrat events stabilisé

---

## TI-191 - US-2-SSE-01 - /v1/events/stream (SSE) (amélioré)

### User story (reformulée)
En tant que client (agent ou ops), je reçois des événements temps réel filtrés par audience et sécurisés, afin d'agir vite et superviser la plateforme.

### API contract v0 (clarifié)

`GET /v1/events/stream?types=...`

Réponses possibles
- 200: stream SSE
- 401: token invalide
- 403: interdit (ex: agent demande scope ops)
- 429: rate limited (trop de connexions ou reconnect storm)

Headers utiles
- `X-Request-Id`
- `X-SSE-Audience: agent|ops`

AC complétés
- Connexion
  - Given token valide
  - When connect SSE
  - Then stream démarre et envoie un heartbeat < 15s
- Filtrage
  - When client passe `types=watchlist.match`
  - Then seuls ces events sont envoyés
- Audience
  - Given token agent
  - Then il ne reçoit que ses events (watchlist.match liés à ses watchlists)
  - Given token ops/admin
  - Then il reçoit tous les events (deal, watchlist, etc.)
- Reconnect
  - When connexion coupe et client reconnect avec Last-Event-ID
  - Then le serveur tente un replay minimal (si activé)
- Résilience
  - When payload event invalide
  - Then l'event n'est pas envoyé, et un log interne est produit (pas de crash stream)

Sécurité
- Pas de PII
- Pas de secrets
- Payload size cap (ex: 8KB par event, sinon truncation)
- Compression: à éviter pour SSE v0 (complexité), ou activer gzip au reverse proxy si stable.

Observabilité
- `sse.event_sent` (compteur)
- `sse.client_connected`, `sse.client_disconnected`
- `sse.replay_hit`, `sse.replay_miss`, `sse.gap`

Dépendances
- TI-180 rate limits (sse.connect, sse.reconnect_ip)
- Store events (DB ou Redis) si Last-Event-ID activé
- Matching engine (TI-190) produit watchlist.match

---

## TI-192 - US-2-SSE-02 - Ops live feed UI (amélioré)

### User story (reformulée)
En tant qu'utilisateur ops, je visualise les événements en live (deals, watchlist matches, plus tard listings/offers/approvals) pour détecter rapidement les anomalies et intervenir.

### Non-goals (v0)
- Recherche full-text dans l'historique long terme (ça sera l'audit log + exports)
- Dashboard analytics complet

### UX requirements (clarifiés)
- Liste temps réel avec:
  - timestamp
  - type
  - entity_type + entity_id
  - actor (system/agent/human)
  - résumé (payload minimal)
- Contrôles:
  - pause/resume auto-scroll
  - filtre par type (multi-select)
  - filtre par entity_id (exact match)
  - compteur de "missed events" quand pause active
- Robustesse:
  - reconnect auto SSE
  - badge "reconnecting..."
  - backoff exponentiel côté client
- Sécurité:
  - ne jamais auto-linkify les URLs
  - ne pas afficher de payloads sensibles
  - si `payload_truncated=true`, afficher "(truncated)"

### Acceptance criteria (complétés)
- Given je suis connecté ops
- When j'ouvre le live feed
- Then je vois des events arriver sans refresh
- When je filtre type=watchlist.match
- Then seuls ces events s'affichent
- When je clique un event
- Then navigation vers la page détail correspondante (deal detail, watchlist detail)
- When SSE se coupe
- Then la page tente de se reconnecter automatiquement et affiche un état

### Dépendances
- TI-191 SSE endpoint fonctionnel
- Auth ops/humain (token admin). Si pas prêt, vous pouvez:
  - utiliser une "service key" côté serveur UI (proxy) et servir le feed aux ops via backend.

### Telemetry
- `ops_live_feed.opened`
- `ops_live_feed.filter_changed`
- `ops_live_feed.event_clicked`

### Test plan
- Simuler stream d'events (mock) et vérifier affichage
- Test reconnect (couper réseau)
- Test no auto-linkify (injection de "http://...")

---

## 6) Dépendances et ordre de livraison recommandé

### 6.1 Dépendances clés (bloquantes)
- Phase 0
  - Auth (agent_id connu)
  - Idempotency sur write
  - Rate limits
  - Audit log
- Phase 1
  - deal.created émis (ou au moins un hook lors de la création)
  - (option) deal.geo si vous voulez geo matching dès P2

### 6.2 Ordre de livraison (chemin critique)
1) TI-189 CRUD watchlists (API + DB)
2) TI-190 Matching deals -> watchlists + watchlist_matches
3) TI-191 SSE stream + watchlist.match events
4) TI-192 Ops live feed UI

Les épics TI-160/TI-161 sont "Done" quand les stories ci-dessus sont Done.

---

## 7) Parallélisation (workstreams)

### Workstream A: Watchlists API
- TI-189
Livrables
- migrations tables watchlists
- endpoints CRUD
- validations + quotas
- audit + telemetry

### Workstream B: Matching engine
- TI-190
Livrables
- table watchlist_matches
- worker matching + dedup
- émission event watchlist.match (peut être stub tant que SSE pas prêt)

### Workstream C: SSE backend
- TI-191
Livrables
- /v1/events/stream
- heartbeats + auth + filters
- anti-abuse (connections, reconnects)
- store events (si replay)

### Workstream D: Console ops
- TI-192
Livrables
- page live feed
- filters + pause + reconnect UX

---

## 8) Décisions v0 à trancher (pour éviter les flottements)
1) Geo/distance: PostGIS activé en Phase 2 ou reporté ?
2) Replay SSE: support Last-Event-ID en v0 ou "best effort no replay" ?
3) Backfill watchlist.create: sync (limit 200) ou async job ?
4) Currency: matching price uniquement si currency identique (recommandé v0) ou conversion FX (plus tard) ?

Fin.
