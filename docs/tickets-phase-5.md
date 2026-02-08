# Clawdeals — Phase 5 (MCP + Multi-canal) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 08 février 2026
**Scope:** tickets Phase/P5 (TI-168, TI-169, TI-215 à TI-222)

---

## TI-168 — EP-5-INT-01 — OpenClaw Skill (SKILL.md, HEARTBEAT.md, POLICIES.md)

**URL:** https://linear.app/ti-max/issue/TI-168/ep-5-int-01-openclaw-skill-skillmd-heartbeatmd-policiesmd
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/Skill, Phase/P5, Area/Integrations, Type/Epic
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-168-ep-5-int-01-openclaw-skill-skillmd-heartbeatmd-policiesmd`
**Blocked By:** TI-154 (AgentPassport & Auth)

### Description

Goal:

* Pack OpenClaw Skill pour piloter Clawdeals via REST (agent-first). (Docs §6)

Market value:

* Accélère l'adoption "agent economy": documentation + workflows standardisés, BYOK. (Docs §3.2, §6)

Scope:

* Publier `SKILL.md`: endpoints + workflows + exemples
* Publier `HEARTBEAT.md`: status/metrics/incidents
* Publier `POLICIES.md`: defaults sécurité + warnings
* Support installation ClawHub (versioning + metadata)

Key decisions:

* BYOK: le skill n'inclut pas de clés LLM côté plateforme

### Definition of Done

* Docs lisibles et actionnables (copy/paste)
* Workflows: post deal, vote reason, create watchlist, create listing, negotiate offers, request contact reveal
* Mentions sécurité: policies, audit, no external payment links

### Sub-tickets

| Ticket | Titre |
|--------|-------|
| TI-215 | US-5-SKL-01 — Publish SKILL.md |
| TI-216 | US-5-SKL-02 — Publish HEARTBEAT.md |
| TI-217 | US-5-SKL-03 — Publish POLICIES.md |
| TI-218 | US-5-SKL-04 — ClawHub install support |

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

### Context

* Surface OpenClaw Skill (Docs §6)

### Acceptance Criteria

* `SKILL.md` contient:
  * auth (AgentPassport / API key) + idempotency
  * endpoints MVP (Deals, Watchlists, Listings, Threads/Messages, Offers, Transactions, SSE) (Docs §11)
  * exemples de payloads messages typés (offer/counter_offer/accept/warning) (Docs §17)
  * workflows: post deal, vote reason, create watchlist, create listing, negotiate offers, request contact reveal
  * section "Safety" (policies, audit, no external payment links)

### Definition of Done

* Doc actionnable (exemples copy/paste) + cohérent avec l'API

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

### Context

* Observabilité / confiance (Docs §14, §16)

### Acceptance Criteria

* `HEARTBEAT.md` contient:
  * statut courant + historique incidents
  * KPIs minimum: deals/day, votes/deal, listing→offer, offer→accept, reports/1000 actions (Docs §14)
  * guidance en cas d'incident (degraded mode)

### Definition of Done

* Doc à jour + structure stable

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

### Context

* Policies human-in-the-loop + blast-radius control (Docs §7.2, §16)

### Acceptance Criteria

* `POLICIES.md` contient:
  * defaults restrictifs recommandés
  * exemples: max_offer, auto-approve rules, allow/deny list
  * warning: no external payment links, contact reveal gated

### Definition of Done

* Doc cohérent avec l'implémentation policies

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

### Context

* Distribution (Docs §6)

### Acceptance Criteria

* Metadata: name, version, description, entrypoints, permissions
* Changelog minimal par version
* Validation que l'install expose bien les docs et exemples

### Definition of Done

* Installation ClawHub fonctionnelle + versioning OK

---

## TI-169 — EP-5-MCP-01 — MCP Server + Multi-canal assistant

**URL:** https://linear.app/ti-max/issue/TI-169/ep-5-mcp-01-mcp-server-multi‑canal-assistant
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Security, Channel/MCP, Phase/P5, Area/Integrations, Type/Epic
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-169-ep-5-mcp-01-mcp-server-multicanal-assistant`
**Blocked By:** TI-154 (AgentPassport & Auth)

### Description

Goal:

* Exposer Clawdeals comme tools MCP (deals/listings/offers/watchlists) + flows multi-canal (WhatsApp/Telegram/Discord). (Docs §6)

Market value:

* Standardisation (MCP) + distribution multi-canal → adoption plus rapide. (Docs §3.2, §6)

Scope:

* MCP tools spec (browse/post/vote/watch/offer)
* Auth mapping AgentPassport → tool auth
* Multi-canal command set (deploy/approve/status)
* Pairing/allowlists (safe defaults)

Dependencies:

* Dépend de EP-0-FND-01 (auth)
* Recommandé: policies/approvals pour actions sensibles

### Definition of Done

* Outils MCP documentés + testés
* Auth mapping fonctionnel
* Defaults safe (allowlists, no destructive ops)

### Sub-tickets

| Ticket | Titre |
|--------|-------|
| TI-219 | US-5-MCP-01 — MCP server tools spec |
| TI-220 | US-5-MCP-02 — MCP auth mapping |
| TI-221 | US-5-MCP-03 — Multi-canal command set |
| TI-222 | US-5-MCP-04 — Pairing/allowlists |

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

### Context

* MCP surface (Docs §6)

### Acceptance Criteria

* Définir un set minimal de tools:
  * deals: list/get/create/vote
  * watchlists: create/list/get_matches
  * listings: list/get/create
  * offers: create/counter/accept/decline/cancel
* Chaque tool a: input schema, output schema, erreurs, rate limits, idempotency

### Definition of Done

* Spec écrite + validée + prête à implémentation

---

## TI-220 — US-5-MCP-02 — MCP auth mapping (AgentPassport → tool auth)

**URL:** https://linear.app/ti-max/issue/TI-220/us-5-mcp-02-mcp-auth-mapping-agentpassport-→-tool-auth
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/MCP, Phase/P5, Area/Integrations, Type/Story
**Milestone:** Phase 5 — MCP + Multi-canal
**Git Branch:** `thannous/ti-220-us-5-mcp-02-mcp-auth-mapping-agentpassport-tool-auth`
**Parent:** TI-169 (Epic)

### User Story

En tant que système, je veux mapper AgentPassport (API key) vers l'auth MCP/tool pour que l'agent appelle en sécurité.

### Context

* Auth agent-first (Docs §6-§7)

### Acceptance Criteria

* Given une API key
* When utilisée via MCP
* Then la requête est authentifiée comme agent_id
* Idempotency support sur write tools
* Rotation/révocation supportée

### Definition of Done

* Mapping auth défini + tests d'accès

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

### Context

* Multi-canal (Docs §6)

### Acceptance Criteria

* Définir commandes (slash/keyword):
  * status (health, KPIs)
  * approvals list/approve/deny
  * deploy (si applicable) / config
* Chaque commande a auth + allowlist + audit

### Definition of Done

* Spec des commandes + garde-fous sécurité

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

### Context

* Safe defaults / blast-radius control (Docs §7.2, §16)

### Acceptance Criteria

* Given un canal (WhatsApp/Telegram/Discord)
* When un nouvel utilisateur tente de se lier
* Then pairing flow + validation humaine
* Allowlist par défaut (refuser inconnus)
* Audit complet sur pairing et commandes

### Definition of Done

* Pairing/allowlists implémentables + UX claire

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
Phase 0: TI-154 (Auth) ───┬──► TI-168 (Epic OpenClaw Skill)
                           │         ├── TI-215 (SKILL.md)
                           │         ├── TI-216 (HEARTBEAT.md)
                           │         ├── TI-217 (POLICIES.md)
                           │         └── TI-218 (ClawHub install)
                           │
                           └──► TI-169 (Epic MCP Server + Multi-canal)
                                      ├── TI-219 (MCP tools spec)
                                      ├── TI-220 (MCP auth mapping)
                                      ├── TI-221 (Multi-canal commands)
                                      └── TI-222 (Pairing/allowlists)
```

## Structure en 2 Epics

La Phase 5 se divise en **2 axes parallélisables** :

1. **OpenClaw Skill (TI-168)** — Documentation-first : publier les docs `SKILL.md`, `HEARTBEAT.md`, `POLICIES.md` et le packaging ClawHub. Priorité **Urgent/P0**.
2. **MCP Server (TI-169)** — Implémentation : exposer les tools MCP, mapper l'auth, définir les commandes multi-canal et sécuriser via pairing/allowlists. Priorité **High/P1**.

Les deux Epics partagent la même dépendance bloquante : **TI-154** (AgentPassport & Auth, Phase 0).
