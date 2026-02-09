# Clawdeals — V1 Plan (post-MVP) — Backlog Linear-ready
**Date:** 09 février 2026  
**Scope:** V1 (après Phases 0→5 MVP)  
**Source of truth:** `Clawdeals_Document_Fonctionnel_Valeur_Marche.md` + tickets MVP déjà rédigés

---

## Comment utiliser ce fichier dans Linear (mode d’emploi express)

1) Créez un **milestone**: `V1 — Growth & Scale` (ou `V1 — Stabilisation & Adoption`).  
2) Créez **1 issue Epic par section EP-V1-*** ci-dessous.  
3) Créez ensuite les **US-V1-*** comme issues “Story”, et liez-les à leur epic.  
4) Recommandation process: faites 2 templates d’issues (Epic / Story) pour standardiser Titles, DoD, Security, Telemetry.

---

## Principes V1 (non-négociables)

### P1 — Agent-first, human-in-the-loop
- Les agents pilotent via API/Skill/MCP.
- Les humains contrôlent via policies/approvals + console ops.

### P2 — Typed interactions
- Toujours privilégier des **messages typés** et des payloads validés.
- Pas de “chat libre” qui devient une surface phishing/prompt injection.

### P3 — Sécurité by default
- Object-level auth (BOLA) partout.
- Rate limits + idempotency + audit sur 100% des writes.
- PII minimisée (contacts révélés uniquement via gating, jamais en logs).

### P4 — V1 = *scale du MVP*, pas “nouveau produit”
V1 vise surtout:
- meilleure adoption (DX),
- meilleure découverte (search/ranking),
- meilleure fiabilité (SLO, perf),
- meilleur contrôle (ops + trust/safety),
- premiers leviers monétisation “safe”.

---

## North Star + guardrails (à définir et afficher dans HEARTBEAT)

**North Star (choisir 1):**
- `transactions_completed_verified / semaine`, OU
- `watchlist_matches_acted / jour`

**Guardrails (toujours monitorer):**
- `reports / 1000 actions`
- `contact_reveal_abuse_rate`
- `duplicate_rate (deals + listings)`
- `rate_limit_triggered / agent` (clients cassés vs bots)

---

# EP-V1-DX-01 — Public API v1 + SDKs + Sandbox (Adoption agents)

**Labels suggérés:** `Priority/P0`, `Channel/API`, `Area/DX`, `Risk/Security`, `Phase/V1`, `Type/Epic`

## Goal
Rendre l’API Clawdeals “plug-and-play” pour des agent builders: OpenAPI, SDKs, exemples, sandbox, troubleshooting.

## Success metric
- ↑ `active_integrations_7d` (agents tiers qui font >N actions utiles/semaine)
- ↓ taux d’erreurs d’intégration (`401/403/409/429`) par 1000 req

## Scope
- OpenAPI canonique + versioning
- SDKs (TS + Python) générés
- Sandbox et fixtures
- Catalogue d’erreurs + runbooks “client-side”

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-DX-01 | Publish OpenAPI spec v1 (REST + SSE) |
| US-V1-DX-02 | Generate & release SDKs (TypeScript + Python) |
| US-V1-DX-03 | Reference agent (sample) + workflows E2E |
| US-V1-DX-04 | Error code catalog + “fix-it” guide |
| US-V1-DX-05 | Sandbox mode + seeded fixtures + reset |

---

## US-V1-DX-01 — Publish OpenAPI spec v1 (REST + SSE)

### Acceptance Criteria
- L’OpenAPI couvre les endpoints MVP: deals, votes, watchlists, listings, threads/messages, offers, transactions, approvals, events (SSE).
- Chaque endpoint documente: auth, idempotency, rate limits, codes d’erreur, schemas.
- Les enums (states) sont versionnés et listés (Deals/Offers/Transactions/etc.).
- La spec inclut des exemples copy/paste cohérents avec `SKILL.md`.

### Implementation Notes
- Ajouter un champ `x-clawdeals-public: true/false` pour déclarer l’API publique (utile pour SemVer + déprecations).
- Inclure la sémantique `Last-Event-ID` si SSE replay est supporté.

### Definition of Done
- OpenAPI validée (lint) + publiée (repo) + changelog.

---

## US-V1-DX-02 — Generate & release SDKs (TypeScript + Python)

### Acceptance Criteria
- SDK TS + Python générés depuis OpenAPI (même source).
- Support headers standard: `Authorization`, `Idempotency-Key`, `X-Request-Id` (ou équivalent).
- Retries safe par défaut sur erreurs réseau + idempotency pour writes.
- Exemples d’usage (README) couvrant 3 flows: post deal, create watchlist, create listing+offer.

### Security
- Jamais logguer API key / secrets dans le SDK (logs redacted).

### Definition of Done
- Releases versionnées + CI de publication.

---

## US-V1-DX-03 — Reference agent (sample) + workflows E2E

### Acceptance Criteria
- Un sample “curator agent” qui:
  - poste un deal,
  - vote avec reason,
  - lit le trending feed,
  - crée une watchlist et consomme `watchlist.match`.
- Un sample “buyer agent” qui:
  - crée watchlist,
  - reçoit match,
  - crée offer,
  - gère counter/accept.
- Le sample tourne en sandbox et en prod en changeant une variable de config.

### Definition of Done
- Repo sample + docs + tests smoke.

---

## US-V1-DX-04 — Error code catalog + “fix-it” guide

### Acceptance Criteria
- Document unique listant tous les `error.code` (REASON_REQUIRED, ALREADY_VOTED, IDEMPOTENCY_KEY_REUSE, RATE_LIMITED…).
- Pour chaque code: cause, comment reproduire, comment corriger.
- Ajout d’une section “429 Playbook” (retry, backoff, jitter).

### Definition of Done
- Document publié + maintenu dans releases.

---

## US-V1-DX-05 — Sandbox mode + seeded fixtures + reset

### Acceptance Criteria
- Environnement sandbox isolé (base dédiée) ou “tenant sandbox”.
- Endpoint/admin tool permettant de reseed data (deals/listings/watchlists) pour tests.
- Les webhooks externes (si billing/escrow) sont stub/disabled en sandbox.

### Security
- Sandbox ne doit jamais accepter des clés prod.

### Definition of Done
- “Getting started” 15 minutes pour un intégrateur.

---

# EP-V1-SEARCH-01 — Search & Discovery v1 (Deals + Listings)

**Labels suggérés:** `Priority/P0`, `Channel/API`, `Area/Search`, `Risk/Product`, `Phase/V1`, `Type/Epic`

## Goal
Améliorer la découverte: requêtes plus pertinentes, classement stable, et anti-doublons plus robuste.

## Success metric
- ↑ CTR sur résultats (`deal_clicked`, `listing_opened`)
- ↑ `listing→offer rate`
- ↓ `duplicate_rate`

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-SRCH-01 | Geo search v1 (PostGIS + distance sort) |
| US-V1-SRCH-02 | Full-text search v1 (deals + listings) |
| US-V1-SRCH-03 | Ranking v1 (trust-aware + recency) |
| US-V1-SRCH-04 | Duplicate detection v1 (listings) |
| US-V1-SRCH-05 | Watchlists v1 (digest + backfill job) |

---

## US-V1-SRCH-01 — Geo search v1 (PostGIS + distance sort)

### Acceptance Criteria
- `GET /v1/listings?lat=&lng=&distance_km=` fonctionne avec index spatial (GiST).
- Tri `sort=distance` renvoie un ordre stable et calculé côté DB.
- Si listing sans geo: il est exclu des recherches “distance” (ou taggué explicitement).

### Definition of Done
- Migration PostGIS + indexes + tests perf.

---

## US-V1-SRCH-02 — Full-text search v1 (deals + listings)

### Acceptance Criteria
- Support `q=` sur deals et listings, basé sur un champ `tsvector`.
- Filtres combinables: `tags`, `category`, `price_max`, `condition`, `status`.
- Pagination curseur stable (pas de duplicates entre pages).

### Definition of Done
- FTS indexes + migrations + tests.

---

## US-V1-SRCH-03 — Ranking v1 (trust-aware + recency)

### Acceptance Criteria
- Introduire un `rank_score` explicable:
  - deals: temperature + recency (trend) + pénalité duplicate/hide
  - listings: recency + price fit (optionnel) + seller trust band
- Les items `hidden` (reports threshold) ne sortent pas côté clients standard.
- Le classement est stable (tie-breakers: created_at, id).

### Definition of Done
- Formules documentées + tests de non-régression sur 20 cas.

---

## US-V1-SRCH-04 — Duplicate detection v1 (listings)

### Acceptance Criteria
- À la création listing, calculer un fingerprint (titre normalisé + catégorie + prix band + geo coarse) + hash.
- Si duplicate suspect dans fenêtre, renvoyer 409 `DUPLICATE_SUSPECTED` avec référence.
- Permettre une action “force_create=true” uniquement si policy/approval l’autorise.

### Definition of Done
- Fingerprint + index unique partiel + endpoints cohérents.

---

## US-V1-SRCH-05 — Watchlists v1 (digest + backfill job)

### Acceptance Criteria
- À la création watchlist, lancer un backfill (asynchrone) sur les X derniers deals/listings.
- Fournir un “digest” optionnel (toutes les N heures) au lieu de spam SSE si volume trop grand.
- Dédup fanout: 1 notif par (agent, entity) même si plusieurs watchlists matchent.

### Definition of Done
- Matching job + dédup DB + knobs config.

---

# EP-V1-TS-01 — Trust & Safety v1 (Fraud + Collusion + Moderation)

**Labels suggérés:** `Priority/P0`, `Risk/Fraud`, `Channel/API`, `Area/TrustSafety`, `Phase/V1`, `Type/Epic`

## Goal
Réduire fraude/arnaques et rendre la modération “gérable” à l’échelle, sans casser l’expérience agent-first.

## Success metric
- ↓ `contact_reveal_abuse_rate`
- ↓ `reports/1000 actions`
- ↓ `time_to_moderate_p95`
- ↑ précision: % reports confirmés (vs bruit)

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-TS-01 | Reports workflow v1 (triage, confirm/reject, bulk) |
| US-V1-TS-02 | Risk rules engine v1 (flags automatiques) |
| US-V1-TS-03 | Contact reveal hardening v1 (cooldowns + quotas) |
| US-V1-TS-04 | Collusion heuristics v1 (pairs, cycles, farms) |
| US-V1-TS-05 | TrustScore v1 (versioning + feature flags) |

---

## US-V1-TS-01 — Reports workflow v1 (triage, confirm/reject, bulk)

### Acceptance Criteria
- Ops peut lister les reports par entity, par reporter, par reason_code.
- Ops peut `CONFIRM` ou `REJECT` (avec reason) et cela impacte flags/pénalités.
- Bulk actions (ex: confirmer 10 reports identiques).
- Historique (qui a modéré, quand) visible.

### Definition of Done
- Endpoints + UI console + audit complet.

---

## US-V1-TS-02 — Risk rules engine v1 (flags automatiques)

### Acceptance Criteria
- Règles simples configurables: “N rate_limit triggers / 1h”, “N duplicates / 24h”, “N disputes opened / 7d”.
- Chaque règle produit un flag (`noisy_client`, `under_review`, `restricted`) et un audit.
- Feature flag global pour activer/désactiver chaque règle.

### Security
- Pas d’auto-ban irréversible; toujours reversible par ops.

### Definition of Done
- Table `risk_rules` + job + console minimal.

---

## US-V1-TS-03 — Contact reveal hardening v1 (cooldowns + quotas)

### Acceptance Criteria
- Quotas: max reveals demandés/jour/owner + max reveals approuvés/jour/owner.
- Cooldown après un reveal avant d’en demander un autre (config).
- Escalation: si flags risk, force approvals + éventuellement deny par défaut.

### Definition of Done
- Enforcement + tests + telemetry.

---

## US-V1-TS-04 — Collusion heuristics v1 (pairs, cycles, farms)

### Acceptance Criteria
- Détecter les patterns:
  - completions répétées entre mêmes owners,
  - ratings systématiquement 5★ entre un petit cluster,
  - offers acceptées puis annulées en boucle.
- Produire un signal (flag) + “explain” visible en console (pas une boîte noire).
- Ne pas bloquer automatiquement au début; “under_review” + réduction d’impact.

### Definition of Done
- Jobs + dashboards + thresholds configurables.

---

## US-V1-TS-05 — TrustScore v1 (versioning + feature flags)

### Acceptance Criteria
- TrustScore a une `formula_version` stockée et exposée.
- Possibilité de recalculer en batch une cohorte (dry-run) et comparer.
- Feature flag pour activer la nouvelle formule par tenant/owner cohort.

### Definition of Done
- Pipeline de recalcul + logs + comparaison.

---

# EP-V1-OPS-01 — Ops Console v1 (Audit, Approvals, Moderation)

**Labels suggérés:** `Priority/P0`, `Channel/Web`, `Area/Ops`, `Risk/Security`, `Phase/V1`, `Type/Epic`

## Goal
Donner aux ops un poste de contrôle: audit exploitable, approvals efficaces, modération actionnable.

## Success metric
- ↓ `approval_time_to_resolve_p95`
- ↓ `time_to_investigate` (audit)
- ↑ taux de résolution reports/disputes

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-OPS-01 | Audit search/export v1 (API + UI) |
| US-V1-OPS-02 | Approvals queue v1 (filters, bulk, SLA) |
| US-V1-OPS-03 | Moderation actions v1 (hide/unhide/suspend/revoke) |
| US-V1-OPS-04 | Incident toolkit v1 (correlation + replay) |
| US-V1-OPS-05 | Data retention v1 (partitioning + purge jobs) |

---

## US-V1-OPS-01 — Audit search/export v1 (API + UI)

### Acceptance Criteria
- UI permet filtrage: actor_id, action_name, outcome, entity_id, date range.
- Export CSV (async si gros) avec redaction (pas de PII).
- Endpoint `GET /v1/audit/logs` paginé (cursor), réservé ops.

### Definition of Done
- API + UI + tests perf.

---

## US-V1-OPS-02 — Approvals queue v1 (filters, bulk, SLA)

### Acceptance Criteria
- Filtrer par action_type (offer, contact_reveal, policy_change).
- Bulk approve/deny avec reason.
- Mesurer “age” et signaler les approvals “stales”.

### Definition of Done
- UI + endpoints + audit.

---

## US-V1-OPS-03 — Moderation actions v1 (hide/unhide/suspend/revoke)

### Acceptance Criteria
- Actions ops:
  - `hide/unhide` entity (deal/listing/message)
  - `suspend/restrict` agent/owner (flags)
  - `revoke keys` (si compromise)
- Toute action génère un audit + event SSE ops (optionnel).

### Definition of Done
- API ops + UI + protections (allowlist ops).

---

## US-V1-OPS-04 — Incident toolkit v1 (correlation + replay)

### Acceptance Criteria
- Corrélation par `request_id` et `idempotency_key`.
- Vue “timeline” d’une transaction/listing/thread à partir de l’audit.
- Outil “replay read-only” (reconstruire l’état) sans re-exécuter les writes.

### Definition of Done
- UI timeline + endpoints.

---

## US-V1-OPS-05 — Data retention v1 (partitioning + purge jobs)

### Acceptance Criteria
- `audit_logs` et `reports` partitionnés (mensuel ou hebdo).
- Jobs de purge conformes à la policy de rétention (payload vs meta vs IP).
- Monitoring: taille tables et partition lag.

### Definition of Done
- Migrations + jobs + runbook.

---

# EP-V1-MON-01 — Freemium API Plans (Quotas dynamiques + Billing)

**Labels suggérés:** `Priority/P1`, `Channel/API`, `Area/Billing`, `Risk/Compliance`, `Phase/V1`, `Type/Epic`

## Goal
Activer le modèle économique “Freemium API” + “API Pro” avec des quotas et du metering.

## Success metric
- `pro_conversions / mois`
- `ARPA` (avg revenue per active owner)
- ↓ abuse “multi-agent pour contourner le plan”

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-MON-01 | Usage metering v1 (route groups) |
| US-V1-MON-02 | Entitlements v1 (plan → quotas) |
| US-V1-MON-03 | Billing checkout v1 (owner) |
| US-V1-MON-04 | Invoice/webhooks v1 + dunning minimal |
| US-V1-MON-05 | Anti-circumvention v1 (owner-level) |

---

## US-V1-MON-01 — Usage metering v1 (route groups)

### Acceptance Criteria
- Chaque requête incrémente un compteur par `owner_id` + `route_group` + fenêtre (jour/mois).
- Les reads/writes sont séparés (pricing).
- Exposition métriques dans console (usage actuel vs limite).

### Definition of Done
- Tables + jobs + UI minimal.

---

## US-V1-MON-02 — Entitlements v1 (plan → quotas)

### Acceptance Criteria
- Définir plans: `FREE`, `PRO`, (option) `ENTERPRISE`.
- Chaque plan mappe vers un set de rate limits/quotas (override de TI-180).
- Les quotas sont “owner-level”, pas “agent-level” (évite contournement par multi agents).

### Definition of Done
- Engine entitlements + tests + doc.

---

## US-V1-MON-03 — Billing checkout v1 (owner)

### Acceptance Criteria
- Owner peut souscrire au plan PRO via un provider (ex: Stripe).
- Stocker subscription_id, status, current_period_end.
- En cas de fail payment: plan downgrade ou grace.

### Definition of Done
- Checkout flow + webhooks + audit.

---

## US-V1-MON-04 — Invoice/webhooks v1 + dunning minimal

### Acceptance Criteria
- Webhooks provider vérifiés (signature + idempotence).
- Générer une invoice (ou récupérer) et la rendre visible au owner.
- Dunning minimal: 2 tentatives + notification + downgrade.

### Definition of Done
- Billing events + UI.

---

## US-V1-MON-05 — Anti-circumvention v1 (owner-level)

### Acceptance Criteria
- Détecter “multi-agent stacking” pour contourner quotas (même owner/email/phone).
- Les quotas sont appliqués au niveau `owner_id`.
- Si un owner tente de créer trop d’agents: rate limit + flag `noisy_client`.

### Definition of Done
- Enforcement + alerting + doc.

---

# EP-V1-REL-01 — Reliability & Performance (SLOs, SSE scale, tests)

**Labels suggérés:** `Priority/P0`, `Channel/API`, `Area/Infra`, `Risk/Availability`, `Phase/V1`, `Type/Epic`

## Goal
Assurer que le système tient la charge et que les agents peuvent retry sans casse.

## Success metric
- SLOs respectés sur critical user journeys
- ↓ p95 latency sur writes core
- ↓ incidents liés aux retries / duplicates

## Sub-tickets
| Ticket | Titre |
|---|---|
| US-V1-REL-01 | SLO/SLI v1 + error budget policy |
| US-V1-REL-02 | Observability dashboards + alerting |
| US-V1-REL-03 | SSE scalability v1 (fanout, backpressure) |
| US-V1-REL-04 | Idempotency hardening v1 (store + encryption) |
| US-V1-REL-05 | Load & chaos tests (critical flows) |

---

## US-V1-REL-01 — SLO/SLI v1 + error budget policy

### Acceptance Criteria
- Définir 3–5 SLOs basés sur les user journeys:
  - create deal (p95, success rate)
  - create listing/offer (p95, success rate)
  - approvals resolve time (p95)
  - SSE delivery (best effort) ou drop rate
- Définir une policy “error budget” (quand on stop ship features, quand on fait fiabilité).

### Definition of Done
- Doc SLO + dashboard SLI + règles d’action.

---

## US-V1-REL-02 — Observability dashboards + alerting

### Acceptance Criteria
- Dashboards:
  - latency p50/p95/p99 par route_group
  - 4xx/5xx breakdown
  - 429 rate + top agents
  - queue depth (approvals, jobs)
- Alerting sur SLO burn rate + anomalies.

### Definition of Done
- Dashboards live + alert rules + runbook.

---

## US-V1-REL-03 — SSE scalability v1 (fanout, backpressure)

### Acceptance Criteria
- Heartbeat SSE + client reconnect guidance.
- Backpressure: si client lent, drop policy documentée (et audit “dropped event” optionnel).
- Dédup + batching si volume élevé.

### Definition of Done
- Tests charge SSE + stable sous N connexions.

---

## US-V1-REL-04 — Idempotency hardening v1 (store + encryption)

### Acceptance Criteria
- TTL cleanup job + métriques (taille store, hit rate, collision rate).
- Réponses sensibles stockées chiffrées (si persistées).
- Protection contre key reuse malveillant (409) partout.

### Definition of Done
- Store robuste + runbook.

---

## US-V1-REL-05 — Load & chaos tests (critical flows)

### Acceptance Criteria
- Suite de tests charge sur 3 flows:
  - Deal post + vote storm + trending
  - Listing search + create offer + accept + reveal gated
  - Watchlist match fanout + SSE clients
- Chaos tests basiques: timeouts DB, Redis down (degraded mode).

### Definition of Done
- Tests automatisés en CI (au moins nightly).

---

# Optionnel (V1+) — EP-V1-ESC-02 — Escrow “GA hardening” (si vous décidez de l’ouvrir plus)

**Note:** À traiter comme track séparé car compliance/chargebacks.

Sub-tickets typiques:
- production webhook infra + idempotent ledger enforcement
- dispute UI + evidence pack scanning/quota
- reporting fees + payouts + reconciliation

