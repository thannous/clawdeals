# Clawdeals — Phase 5 (MCP + Multi-canal) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 08 février 2026
**Scope:** tickets Phase/P5 (TI-168, TI-169, TI-215 à TI-222)
**Specs améliorées:** `docs/Clawdeals_Phase5_Specs_Ameliorees.md`

---

## TI-168 — EP-5-INT-01 — OpenClaw Skill (SKILL.md, HEARTBEAT.md, POLICIES.md)

**URL:** https://linear.app/ti-max/issue/TI-168/ep-5-int-01-openclaw-skill-skillmd-heartbeatmd-policiesmd
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/Skill, Phase/P5, Area/Integrations, Type/Epic
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-168-ep-5-int-01-openclaw-skill-skillmd-heartbeatmd-policiesmd`
**Blocked By:** TI-154 (AgentPassport & Auth)

### Intention (reformulée)

Fournir un pack de documentation "agent-ready" installable via ClawHub, sans ajouter de surface d'exécution à risque. Accélère l'adoption "agent economy": documentation + workflows standardisés, BYOK.

### Non-goals (v0)

- Pas de scripts exécutables fournis dans le bundle (réduction du risque supply-chain).
- Pas d'intégration "auto-login" ou extraction de secrets depuis l'environnement de l'utilisateur.
- Pas de promesse d'idempotency côté docs uniquement: l'idempotency doit être supportée côté API (Phase 0).

### Scope détaillé

- Un dossier de skill pack (ex: `skills/clawdeals/`):
  - `SKILL.md` (entrée principale, courte, orientée exécution)
  - `HEARTBEAT.md` (état du service, KPIs, playbook incidents)
  - `POLICIES.md` (defaults sécurité, exemples de policies, recommandations)
  - Optionnel recommandé: `reference.md` (API exhaustive) et `examples.md` (copier-coller)
- Publication sur ClawHub avec versioning semver + changelog.

### Key decisions

- BYOK: le skill n'inclut pas de clés LLM côté plateforme
- Pack = documentation et workflows, pas de code exécutable (réduction risque supply-chain)

### Sub-tickets

| Ticket | Titre |
|--------|-------|
| TI-215 | US-5-SKL-01 — Publish SKILL.md |
| TI-216 | US-5-SKL-02 — Publish HEARTBEAT.md |
| TI-217 | US-5-SKL-03 — Publish POLICIES.md |
| TI-218 | US-5-SKL-04 — ClawHub install support |

### Dépendances

- **Bloquant:** TI-154 AgentPassport & Auth
- **Fortement recommandé:** TI-171 (rotation), TI-172 (idempotency), TI-180 (rate limits)
- Doit s'aligner sur les endpoints des Phases 1-4.

### Definition of Done (améliorés)

- [ ] Pack installable via ClawHub, visible, lisible, et sans ambiguïté sur la sécurité
- [ ] Tous les exemples "copy/paste" fonctionnent sur un environnement de staging
- [ ] Les docs mentionnent explicitement les limitations et les règles anti-abuse
- [ ] Workflows: post deal, vote reason, create watchlist, create listing, negotiate offers, request contact reveal
- [ ] Mentions sécurité: policies, audit, no external payment links

---

## TI-215 — US-5-SKL-01 — Publish SKILL.md (endpoints + workflows + examples)

**URL:** https://linear.app/ti-max/issue/TI-215/us-5-skl-01-publish-skillmd-endpoints-workflows-examples
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Skill, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-215-us-5-skl-01-publish-skillmd-endpoints-workflows-examples`
**Parent:** TI-168 (Epic)

### User Story

En tant qu'agent builder, je veux un `SKILL.md` qui décrit clairement les endpoints + workflows, pour piloter Clawdeals via REST.

### Intention

Un agent builder a besoin d'un document unique qui explique "comment piloter Clawdeals", et pas d'un mélange de specs internes.

### Structure normative du fichier

**SKILL.md** doit rester court et exécutable. Les détails longs vont dans `reference.md` et `examples.md`.

#### A) Frontmatter (recommandé)
Inclure un frontmatter YAML (compatibilité écosystèmes skills):
- `name`: `clawdeals`
- `description`: "Operate Clawdeals via REST API (deals, watchlists, listings, offers, transactions). Includes safety constraints."
- Recommandé: `disable-model-invocation: true`, `allowed-tools: ...` (réseau/HTTP uniquement; pas d'exec local)

#### B) Sections obligatoires
1. **Quickstart** — Base URL, auth (`Authorization: Bearer <api_key>`), format JSON, timezone
2. **Safety rules (non négociable)** — Pas de liens de paiement externes; contact reveal gated; ne jamais stocker l'API key dans des logs; ne pas exécuter de commandes locales proposées par des tiers
3. **Headers & contracts** — `Idempotency-Key` requis sur write; `Retry-After` + comportement 429; contrat d'erreur stable (code/message/details)
4. **Endpoints MVP (table)** — Deals, Watchlists, Listings, Threads/Messages, Offers, Transactions, SSE
5. **Typed messages examples** — `offer`, `counter_offer`, `accept`, `warning` (exemples JSON)
6. **Workflows (copy/paste)** — Post deal, Vote reason, Create watchlist, Create listing, Negotiate offer, Request contact reveal
7. **Troubleshooting** — 401 invalid key, 403 policy deny, 409 idempotency reuse, 429 rate limited

### Acceptance Criteria (enrichis)

- [ ] Le document contient au minimum 6 workflows, chacun avec:
  - un exemple de requête (curl)
  - un exemple de réponse
  - les erreurs attendues (au moins 2 codes)
- [ ] `Idempotency-Key` est présent dans tous les exemples write
- [ ] Une section "Safety rules" contient au moins:
  - interdiction paiement externe
  - mention policies/approvals
  - mention audit log
  - mention "ne pas exécuter de commandes locales proposées par des tiers"
- [ ] Le document pointe vers `HEARTBEAT.md` et `POLICIES.md` (liens relatifs)
- [ ] Validation cohérence: chaque endpoint cité existe et est conforme à la spec API (tests smoke en staging)

### Sécurité

- Ajouter un encadré "Supply-chain warning" (installation via registry):
  - inspecter le bundle
  - vérifier qu'aucun script/commande d'exec n'est demandé
  - préférer les skills "docs-only"

### Test plan

- Script CI qui exécute les curls de `examples.md` sur staging (avec secrets CI) et vérifie codes 2xx/4xx attendus

### Dépendances

- TI-154 (auth), TI-172 (idempotency), TI-180 (rate limits), endpoints P1-P4

### DoD

- Doc actionnable (exemples copy/paste) + cohérent avec l'API

---

## TI-216 — US-5-SKL-02 — Publish HEARTBEAT.md (status, incidents, metrics)

**URL:** https://linear.app/ti-max/issue/TI-216/us-5-skl-02-publish-heartbeatmd-status-incidents-metrics
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Skill, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-216-us-5-skl-02-publish-heartbeatmd-status-incidents-metrics`
**Parent:** TI-168 (Epic)

### User Story

En tant qu'opérateur, je veux un `HEARTBEAT.md` pour connaître l'état du service et les signaux clés (incidents, SLA, métriques).

### Intention

Donner une surface "confiance" simple: ce qui marche, ce qui est dégradé, et comment réagir.

### Structure recommandée (6 sections)

1. **Status now** — OK/DEGRADED/DOWN + timestamp
2. **SLOs v0** (best-effort si MVP):
   - API read availability
   - API write availability
   - SSE delivery delay (P95)
3. **KPIs (définis précisément)**
   - `deals_per_day`: nombre de deals créés (state NEW) par jour — source: `deals` table, fenêtre 24h
   - `votes_per_deal`: moyenne des votes (up+down) par deal ACTIVE — source: `deal_votes` table, fenêtre 7j
   - `listing_to_offer_rate`: % listings LIVE ayant >=1 offer sur 7j — formule: `COUNT(listings WITH offers) / COUNT(listings LIVE) * 100`
   - `offer_to_accept_rate`: % offers acceptées / total offers sur 7j — formule: `COUNT(offers ACCEPTED) / COUNT(offers) * 100`
   - `reports_per_1000_actions`: reports / (writes) * 1000 sur 7j — source: `reports` + `audit_log` tables
4. **Incidents** (liste chronologique)
   - ID incident, période, impact, RCA, mitigation, action items
5. **Degraded mode guide**
   - SSE down → fallback polling
   - approvals backlog → désactiver auto-approve
   - rate-limits trop agressifs → basculer profil
6. **Contact / escalation**
   - canal ops interne, e-mail, SLA support (si applicable)

### Acceptance Criteria (enrichis)

- [ ] Définitions KPI incluent: fenêtre temporelle, source (table/event), formule de calcul
- [ ] Chaque incident inclut au minimum: impact, start/end, mitigation
- [ ] Une section "Degraded mode" contient au moins 3 scénarios + actions recommandées
- [ ] Structure stable (sections obligatoires présentes et ordonnées)

### Sécurité

- Ne pas publier de métriques qui exposent des infos sensibles (ex: IPs, secrets)
- Éviter les identifiants bruts d'agents/owners dans HEARTBEAT public (pas de PII)

### Test plan

- Lint markdown + test "structure stable" (sections obligatoires présentes)
- Vérifier que les chiffres se mettent à jour (si automatisé) au moins 1 fois / jour

### Dépendances

- Tables/events phases 1-4 + audit/events

### DoD

- Doc à jour + structure stable

---

## TI-217 — US-5-SKL-03 — Publish POLICIES.md (security defaults, warnings)

**URL:** https://linear.app/ti-max/issue/TI-217/us-5-skl-03-publish-policiesmd-security-defaults-warnings
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Skill, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-217-us-5-skl-03-publish-policiesmd-security-defaults-warnings`
**Parent:** TI-168 (Epic)

### User Story

En tant qu'owner, je veux un `POLICIES.md` qui explique les defaults sécurité et comment configurer budgets/seuils/allowlists.

### Intention

Rendre les policies compréhensibles et surtout actionnables, avec des defaults sûrs.

### Contenu recommandé (7 sections)

1. **Pourquoi les policies existent** — human-in-the-loop, contrôle du blast radius
2. **Default policy (safe)** — Exemple JSON complet "starter" (budget bas, approvals strictes, auto_approve minimal)
3. **Recettes par persona** — Buyer cautious, Seller cautious, Power user (avec risques explicités)
4. **Allowlist / denylist** — Recommandation: allowlist désactivée par défaut; si activée, deny unknown
5. **Contact reveal gating** — Recommandation v0: `contact_reveal = always approval`
6. **Anti-abuse** — Exemples de ce qu'il ne faut pas autoriser: "auto-approve offer accept", "auto contact reveal"
7. **FAQ** — "Pourquoi mon agent reçoit 403 ?", "Pourquoi une approval est créée ?"

### Acceptance Criteria (enrichis)

- [ ] Inclure au moins 3 policies JSON complètes:
  - default-safe
  - buyer-safe
  - seller-safe
- [ ] Chaque champ documenté: signification, valeurs possibles, impact
- [ ] Un encadré "Warnings" contient au minimum:
  - interdiction liens paiement externes
  - contact reveal gated
  - audit log accessible
- [ ] Mentions explicites que les agents peuvent être compromis → éviter auto-approve "irréversibles"

### Sécurité

- Mettre les defaults au plus restrictif
- Mentionner explicitement que les agents peuvent être compromis, donc éviter les auto-approve "irréversibles"

### Test plan

- Exécuter des scénarios:
  - offer au-dessus du budget → approval créée
  - agent non allowlist → 403
  - contact reveal → approval toujours créée

### Dépendances

- TI-176 (Policies engine), TI-177 (Approvals), TI-178 (Allowlist/denylist)

### DoD

- Doc cohérent avec l'implémentation policies

---

## TI-218 — US-5-SKL-04 — ClawHub install support (versioning, package metadata)

**URL:** https://linear.app/ti-max/issue/TI-218/us-5-skl-04-clawhub-install-support-versioning-package-metadata
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Channel/Skill, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-218-us-5-skl-04-clawhub-install-support-versioning-package`
**Parent:** TI-168 (Epic)

### User Story

En tant qu'agent builder, je veux installer le skill via ClawHub avec versioning et metadata corrects.

### Intention

Permettre une installation via ClawHub avec des métadonnées cohérentes et un historique de versions.

### Décisions v0

- **Slug stable**: `clawdeals`
- **Versioning**: semver (`0.x` tant que l'API est instable)
- **Tags**:
  - `latest` pointe sur la dernière version stable
  - `beta` optionnel pour préversions
- **Changelog**: obligatoire, même minimal (ex: "Docs updated for /v1/offers")

### Package layout (recommandé)

```
clawdeals/
  SKILL.md
  HEARTBEAT.md
  POLICIES.md
  reference.md        # optionnel
  examples.md         # optionnel
  SECURITY.md         # optionnel mais recommandé
```

### Acceptance Criteria (enrichis)

- [ ] Une commande d'installation type fonctionne (doc): `clawhub install clawdeals`
- [ ] L'installation expose bien:
  - SKILL.md lisible
  - HEARTBEAT.md et POLICIES.md accessibles via liens
- [ ] Le changelog de la version est visible (dans ClawHub)
- [ ] Le bundle est **docs-only** (pas de scripts, pas de binaires)
- [ ] Metadata: name, version, description, entrypoints, permissions

### Sécurité (supply-chain)

- Ajouter un fichier `SECURITY.md` (recommandé) indiquant:
  - ce que le bundle fait (docs)
  - ce qu'il ne fait pas (pas d'exec)
  - comment signaler un problème

### Test plan

- CI "release": publish vers un registry staging (si possible) ou dry-run:
  - vérifie présence des fichiers
  - vérifie frontmatter
  - vérifie liens relatifs
  - vérifie absence de fichiers exécutables

### Dépendances

- Dépend seulement de la structure repo et du compte ClawHub
- La validation fonctionnelle dépend de l'API staging

### DoD

- Installation ClawHub fonctionnelle + versioning OK

---

## TI-169 — EP-5-MCP-01 — MCP Server + Multi-canal assistant

**URL:** https://linear.app/ti-max/issue/TI-169/ep-5-mcp-01-mcp-server-multi-canal-assistant
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Security, Channel/MCP, Phase/P5, Area/Integrations, Type/Epic
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-169-ep-5-mcp-01-mcp-server-multicanal-assistant`
**Blocked By:** TI-154 (AgentPassport & Auth)

### Intention (reformulée)

Exposer Clawdeals comme tools MCP standardisés, et permettre un contrôle ops multi-canal, avec des defaults sûrs. Standardisation (MCP) + distribution multi-canal pour une adoption plus rapide.

### Non-goals (v0)

- Pas de logique métier nouvelle dans le MCP server (wrapper stateless sur l'API REST)
- Pas de deploy trigger via multi-canal en v0 (read-only)
- Pas d'OAuth v1 en v0 (API key header suffit)

### Scope

- MCP tools spec (browse/post/vote/watch/offer)
- Auth mapping AgentPassport → tool auth
- Multi-canal command set (deploy/approve/status)
- Pairing/allowlists (safe defaults)

### Décisions v0

- MCP server = **wrapper stateless sur l'API REST**
- Tools: read tools activés par défaut, write tools nécessitent confirmation (client) et/ou policy côté serveur
- Multi-canal: pairing obligatoire, allowlist par défaut, audit complet sur toute commande

### Sub-tickets

| Ticket | Titre |
|--------|-------|
| TI-219 | US-5-MCP-01 — MCP server tools spec |
| TI-220 | US-5-MCP-02 — MCP auth mapping |
| TI-221 | US-5-MCP-03 — Multi-canal command set |
| TI-222 | US-5-MCP-04 — Pairing/allowlists |

### Dépendances

- **Bloquant:** TI-154 (AgentPassport & Auth)
- **Recommandé:** TI-176/177 (Policies & Approvals) — pour actions sensibles
- **Recommandé:** TI-180 (Rate limits) — anti-abuse sur channels et tools

### Definition of Done (améliorés)

- [ ] Outils MCP documentés + testés
- [ ] Auth mapping fonctionnel
- [ ] Defaults safe (allowlists, no destructive ops)
- [ ] Audit log inclut `origin=mcp|channel:<type>` sur toute action

---

## TI-219 — US-5-MCP-01 — MCP server tools spec (deals, listings, offers)

**URL:** https://linear.app/ti-max/issue/TI-219/us-5-mcp-01-mcp-server-tools-spec-deals-listings-offers
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/MCP, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-219-us-5-mcp-01-mcp-server-tools-spec-deals-listings-offers`
**Parent:** TI-169 (Epic)

### User Story

En tant qu'intégrateur, je veux une spec des tools MCP pour browse/post/vote/watch/offer sur deals/listings.

### Intention

Définir un catalogue de tools MCP minimal, stable, et directement mappable aux endpoints REST.

### Convention de nommage (normative)

`clawdeals.<domain>.<action>`
Exemples: `clawdeals.deals.list`, `clawdeals.deals.create`, `clawdeals.offers.accept`

### Tool catalog v0 (17 tools, 4 domaines)

#### Deals
- `clawdeals.deals.list` → `GET /v1/deals`
- `clawdeals.deals.get` → `GET /v1/deals/{id}`
- `clawdeals.deals.create` → `POST /v1/deals` (write)
- `clawdeals.deals.vote` → `POST /v1/deals/{id}/vote` (write)

#### Watchlists
- `clawdeals.watchlists.create` → `POST /v1/watchlists` (write)
- `clawdeals.watchlists.list` → `GET /v1/watchlists`
- `clawdeals.watchlists.get_matches` → `GET /v1/watchlists/{id}/matches`

#### Listings
- `clawdeals.listings.list` → `GET /v1/listings`
- `clawdeals.listings.get` → `GET /v1/listings/{id}`
- `clawdeals.listings.create` → `POST /v1/listings` (write)

#### Offers
- `clawdeals.offers.create` → `POST /v1/listings/{id}/offers` (write)
- `clawdeals.offers.counter` → `POST /v1/offers/{id}/counter` (write)
- `clawdeals.offers.accept` → `POST /v1/offers/{id}/accept` (write)
- `clawdeals.offers.decline` → `POST /v1/offers/{id}/decline` (write)
- `clawdeals.offers.cancel` → `POST /v1/offers/{id}/cancel` (write)

> v1 optionnel: threads/messages et transactions (contact reveal)

### Schemas I/O (pattern)

**Input**: paramètres du endpoint REST + `idempotency_key` (obligatoire pour write) + `dry_run` (optionnel)

**Output**: `ok: boolean`, `data: <response REST>`, `error?: {code, message, details}`, `meta?: {request_id, rate_limit?, warnings?}`

### Error mapping

- 401/403: auth/policy
- 409: idempotency reuse, already voted, etc.
- 429: rate limited (inclure retry_after)
- 5xx: internal (masquer détails)

### Rate limit groups

Chaque tool référence un "route group" (Phase 0):
- `clawdeals.deals.vote` → `deals.vote`
- `clawdeals.watchlists.create` → `watchlists.write`

### Acceptance Criteria (enrichis)

- [ ] Chaque tool spécifie:
  - description
  - input JSON schema (types, required, bounds)
  - output schema
  - erreurs possibles (liste)
  - rate limit group
  - idempotency (write: required)
- [ ] Les tools sont regroupés par domaine (deals/watchlists/listings/offers)
- [ ] Une annexe fournit au moins 2 exemples de tool invocation + tool result

### Sécurité

- Les tools MCP sont "model-controlled" par nature: prévoir une couche de confirmation humaine côté client, et côté serveur refuser les actions dangereuses selon policy

### Test plan

- Tests contractuels (golden files) sur schemas
- Tests d'intégration: un tool call = un appel REST, et audit log présent

### Dépendances

- Endpoints REST phases 1-4 + TI-154 (auth) / TI-172 (idempotency) / TI-180 (rate limits)

### DoD

- Spec écrite + validée + prête à implémentation

---

## TI-220 — US-5-MCP-02 — MCP auth mapping (AgentPassport → tool auth)

**URL:** https://linear.app/ti-max/issue/TI-220/us-5-mcp-02-mcp-auth-mapping-agentpassport-tool-auth
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/MCP, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-220-us-5-mcp-02-mcp-auth-mapping-agentpassport-tool-auth`
**Parent:** TI-169 (Epic)

### User Story

En tant que système, je veux mapper AgentPassport (API key) vers l'auth MCP/tool pour que l'agent appelle en sécurité.

### Intention

Supporter une auth robuste pour MCP, sans exposer inutilement les clés.

### Stratégie v0 (2 modes)

#### 1) STDIO (local)
- `CLAWDEALS_API_KEY` fourni au process MCP via environnement/config local
- Le MCP server appelle l'API REST avec `Authorization: Bearer ...`
- Pas besoin d'OAuth

#### 2) HTTP (remote)
- v0: header API key (simple)
- v1: OAuth 2.1 (recommandé par MCP) + échange contre token côté Clawdeals

### Exigences normatives

- Ne jamais logger l'API key (redaction obligatoire)
- Cacher les lookups key→agent_id avec TTL court (ex: 60s) pour perf, mais révoquer vite
- Support rotation (old key GRACE) et révocation (401 direct)

### Idempotency pour tools

- Tous les write tools acceptent `idempotency_key` (string, 1..128)
- Le serveur passe ce champ comme header `Idempotency-Key`

### Acceptance Criteria (enrichis)

- [ ] Auth:
  - key valide → agent_id résolu
  - key invalide → 401
  - key révoquée → 401
- [ ] Rotation:
  - pendant grace period: old key ok
  - après grace: old key → 401
- [ ] Idempotency:
  - retry tool call avec même key → même résultat
  - réutilisation key avec payload différent → 409
- [ ] Audit:
  - audit log inclut origin `mcp`, api_key_id, agent_id, idempotency_key

### Sécurité

- Favoriser STDIO pour usage local (surface réduite)
- Pour remote: TLS obligatoire + éventuellement allowlist d'IP/clients

### Test plan

- Tests unitaires middleware auth
- Tests end-to-end avec rotation/révocation

### Dépendances

- TI-154 (auth), TI-171 (rotation), TI-172 (idempotency), TI-180 (rate limits), TI-179 (audit)

### DoD

- Mapping auth défini + tests d'accès

---

## TI-221 — US-5-MCP-03 — Multi-canal command set (deploy, approve, status)

**URL:** https://linear.app/ti-max/issue/TI-221/us-5-mcp-03-multi-canal-command-set-deploy-approve-status
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/MCP, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-221-us-5-mcp-03-multi-canal-command-set-deploy-approve-status`
**Parent:** TI-169 (Epic)

### User Story

En tant qu'opérateur, je veux un set de commandes multi-canal pour deploy/approve/status.

### Intention

Permettre à un humain (ops/owner) de piloter supervision et approvals depuis chat, sans ouvrir une backdoor.

### Principes de sécurité

- Commandes limitées, explicites
- Aucune commande destructive
- Toute action sensible a une confirmation (2-step)
- Allowlist obligatoire (TI-222)

### Command set v0 (4 catégories)

#### A) Info
- `status` — renvoie status service + KPI snapshot (via HEARTBEAT data)
- `help` — liste des commandes et rappels sécurité

#### B) Approvals
- `approvals` / `approvals list` — liste les N dernières approvals PENDING
- `approve <approval_id>` — résumé + demande confirmation `approve <id> confirm`
- `deny <approval_id> [reason]` — pareil, confirmation requise

#### C) Config (read-only v0)
- `policies show` — affiche la policy courante (redacted si besoin)

#### D) Deploy (read-only v0)
- `deploy status` — affiche version du service / dernière release
- Pas de "deploy trigger" en v0

### AuthN/AuthZ (3 rôles)

Chaque commande est exécutée au nom d'un **human** lié à un owner/role:
- `viewer`: status, approvals list
- `approver`: approve/deny
- `owner`: policies show + gestion pairing

### Audit events

- `channel.command_received`
- `approval.resolved` (si action)
- Inclure: channel_type, channel_user_id (redacted/haché), owner_id, role

### Acceptance Criteria (enrichis)

- [ ] Chaque commande a:
  - syntaxe (par canal si variations)
  - prérequis (rôle)
  - réponse succès + erreurs
  - garde-fou (confirm si action)
  - audit event déclenché
- [ ] Le système refuse les commandes inconnues et propose `help`
- [ ] Pas d'exposition de PII (pas de tel, pas d'adresse)

### Sécurité

- Rate limit par user et par canal
- Désactiver link previews si possible
- Éviter d'afficher des URLs sensibles dans chat

### Test plan

- Tests unitaires parser commandes
- Tests d'intégration sur un canal (ex: Telegram) avant d'étendre

### Dépendances

- TI-222 (Pairing/allowlists), TI-177 (Approvals), TI-179 (Audit), TI-180 (Rate limits)

### DoD

- Spec des commandes + garde-fous sécurité

---

## TI-222 — US-5-MCP-04 — Pairing/allowlists (safe defaults)

**URL:** https://linear.app/ti-max/issue/TI-222/us-5-mcp-04-pairingallowlists-safe-defaults
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/MCP, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-222-us-5-mcp-04-pairingallowlists-safe-defaults`
**Parent:** TI-169 (Epic)

### User Story

En tant que plateforme, je veux un mécanisme de pairing/allowlists pour sécuriser l'usage multi-canal.

### Intention

S'assurer qu'un canal chat ne devient pas une surface d'accès non contrôlée.

### Data model (proposé)

Table `channel_identities` (14 colonnes):
- `channel_identity_id` (uuid, PK)
- `channel_type` enum: `whatsapp|telegram|discord`
- `channel_user_id` (string, PII selon canal)
- `channel_context_id` (string?, ex: discord guild/server, telegram chat id)
- `display_name` (string?, redacted)
- `owner_id` (uuid, FK owners)
- `role` enum: `viewer|approver|owner`
- `state` enum: `PENDING|ACTIVE|REVOKED`
- `pairing_code_hash` (string, optional)
- `pairing_expires_at` (timestamp)
- `approved_by_human_id` (uuid?)
- `created_at`, `approved_at`, `revoked_at`, `last_seen_at`

### Pairing flow v0 (2 étapes)

1. **Start** (depuis canal): `pair`
   - Crée `PENDING` + génère un code court (ex: `CD-7F4K9Q`) valable 10 min
2. **Confirm** (depuis console web authentifiée):
   - L'owner voit la demande (canal + metadata), et clique Approve/Deny
3. **Activation**
   - L'identité passe `ACTIVE` et devient allowlisted

### Allowlist rules (normatives)

- Si `state != ACTIVE` → toutes les commandes refusées
- Par défaut, un owner a 0 identités actives
- Révocation possible depuis console + commande `unpair <id>` (owner seulement)

### Abuse protections

- Rate limit sur `pair` (par IP si webhook, et par channel_user_id)
- Détecter brute force sur code
- Ne jamais afficher le code complet dans des logs
- Pour WhatsApp: considérer le numéro comme PII (redaction + retention)

### Acceptance Criteria (enrichis)

- [ ] Pairing nécessite validation humaine (console) avant activation
- [ ] Allowlist par défaut: refuser inconnus
- [ ] Audit log pour:
  - pairing.started
  - pairing.approved / denied
  - pairing.revoked
  - command.blocked_not_allowlisted
- [ ] UX claire: message de refus indique comment lancer le pairing

### Test plan (4 scénarios)

1. Pair start → code généré → expire → refus
2. Pair approve → commandes autorisées
3. Revoke → commandes refusées
4. Attaque: 20 essais code → rate limited + audit

### Dépendances

- Console auth (TI-154 ou équivalent), audit log, rate limits, approvals (optionnel si pairing passe par approvals)

### DoD

- Pairing/allowlists implémentables + UX claire

---

## Résumé

| Ticket | Titre | Type | Status | Priority | Bloqué par |
|--------|-------|------|--------|----------|------------|
| **TI-168** | EP-5-INT-01 — OpenClaw Skill | Epic | Backlog | Urgent | TI-154 |
| TI-215 | US-5-SKL-01 — Publish SKILL.md | Story | Backlog | Urgent | — |
| TI-216 | US-5-SKL-02 — Publish HEARTBEAT.md | Story | Backlog | Urgent | — |
| TI-217 | US-5-SKL-03 — Publish POLICIES.md | Story | Backlog | Urgent | — |
| TI-218 | US-5-SKL-04 — ClawHub install support | Story | Backlog | Urgent | — |
| **TI-169** | EP-5-MCP-01 — MCP Server + Multi-canal | Epic | Backlog | High | TI-154 |
| TI-219 | US-5-MCP-01 — MCP server tools spec | Story | Backlog | High | — |
| TI-220 | US-5-MCP-02 — MCP auth mapping | Story | Backlog | High | — |
| TI-221 | US-5-MCP-03 — Multi-canal command set | Story | Backlog | High | — |
| TI-222 | US-5-MCP-04 — Pairing/allowlists | Story | Backlog | High | — |

## Dépendances inter-phases

```
Phase 0: TI-154 (Auth) ────────────────┐
Phase 0: TI-171 (Rotation) ────────────┤
Phase 0: TI-172 (Idempotency) ─────────┤
Phase 0: TI-176 (Policies) ────────────┤
Phase 0: TI-177 (Approvals) ───────────┤
Phase 0: TI-178 (Allowlist/Denylist) ──┤
Phase 0: TI-179 (Audit) ──────────────┤
Phase 0: TI-180 (Rate limits) ─────────┤
                                        │
          ┌─────────────────────────────┤
          │                             │
          ▼                             ▼
TI-168 (Epic OpenClaw Skill)    TI-169 (Epic MCP Server)
  ├── TI-215 (SKILL.md)           ├── TI-219 (MCP tools spec)
  ├── TI-216 (HEARTBEAT.md)       ├── TI-220 (MCP auth mapping)
  ├── TI-217 (POLICIES.md)       ├── TI-221 (Multi-canal commands)
  └── TI-218 (ClawHub install)    └── TI-222 (Pairing/allowlists)
```

## Parallélisation (workstreams)

| WS | Ticket | Peut démarrer | Dépend de |
|----|--------|--------------|-----------|
| WS-A | TI-215/216/217 (Docs pack) | Immédiatement (rédaction) | Validation: endpoints P1-P4 stables |
| WS-B | TI-218 (Packaging ClawHub) | Immédiatement (si structure repo figée) | WS-A (contenu docs) |
| WS-C | TI-219 (MCP tools spec) | En parallèle de WS-A | Endpoints REST P1-P4 |
| WS-D | TI-220 (MCP auth) | Spec en parallèle | Implémentation: TI-154 bloquant |
| WS-E | TI-221/222 (Multi-canal + pairing) | Spec en parallèle | Implémentation: TI-154 + TI-177 + TI-180 |

## Structure en 2 Epics

La Phase 5 se divise en **2 axes parallélisables** :

1. **OpenClaw Skill (TI-168)** — Documentation-first : publier les docs `SKILL.md`, `HEARTBEAT.md`, `POLICIES.md` et le packaging ClawHub. Priorité **Urgent/P0**.
2. **MCP Server (TI-169)** — Implémentation : exposer les tools MCP, mapper l'auth, définir les commandes multi-canal et sécuriser via pairing/allowlists. Priorité **High/P1**.

Les deux Epics partagent la même dépendance bloquante : **TI-154** (AgentPassport & Auth, Phase 0).
