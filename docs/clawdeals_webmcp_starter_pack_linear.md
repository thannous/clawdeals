# Clawdeals — WebMCP Starter Pack (Linear import)

Objectif: rendre l’app web Clawdeals « agent-friendly » **dans le navigateur** via **WebMCP** (tools déclarés/structurés), pour éviter l’automation DOM fragile et garder un contrôle humain (preview/confirm, policies, audit).

## Références (contexte)
- WebMCP (proposition): https://github.com/webmachinelearning/webmcp
- W3C WebML CG minutes (root object `navigator.modelContext`): https://www.w3.org/2025/10/02-webmachinelearning-minutes.html
- Article early preview Chrome 146 + inspector extension: https://dev.to/axrisi/chromes-webmcp-early-preview-the-end-of-ai-agents-clicking-buttons-b6e
- Clawdeals docs: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`
- Invariants platform (idempotency/audit/rate limits): `tickets-phase-0.md`

---

## TI-310 — EP-5-WEBMCP-01 — WebMCP Starter Pack (tools in-browser via `navigator.modelContext`)

**Type:** Epic  
**Priority:** High (P1)  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security, Area/Integrations  
**Milestone:** Phase 5 — MCP + Multi‑canal (extension)  

**Dependencies (bloquantes):**
- TI-154 Auth (owner session) + CSRF (ou équivalent)
- TI-172 Idempotency middleware (writes)
- TI-179 Audit log middleware (writes)
- TI-180 Rate limits (writes)
- TI-176 Policies + TI-177 Approvals (pour actions sensibles)
- Endpoints Deals/Listings/Approvals existants (Phases 1–3)

### Goal

Exposer un set **minimal, sûr et stable** de tools WebMCP depuis l’app web Clawdeals afin que:
- un agent in-browser (extension / assistant) puisse **appeler des fonctions** au lieu de cliquer sur l’UI,
- l’humain garde un contrôle explicite (preview/confirm),
- la plateforme garde la même sécurité (policies, audit, idempotency, rate limits).

### Non-goals (v0)

- Support « headless » / autonome sans UI (hors scope WebMCP v0).
- Exposer des données sensibles (email, téléphone, adresse, API keys).
- Actions irréversibles sans confirmation (contact reveal, escrow, etc.).

### Scope (Sub-tickets)

| Ticket | Titre |
|---|---|
| TI-311 | US-5-WEBMCP-01 — Capability detection + feature flag + dev doc |
| TI-312 | US-5-WEBMCP-02 — Tool registry (read-only: deals/listings/approvals) |
| TI-313 | US-5-WEBMCP-03 — Preview/Confirm gate (required for write tools) |
| TI-314 | US-5-WEBMCP-04 — Write tool: create listing draft (safe write) |
| TI-315 | US-5-WEBMCP-05 — Admin tool: resolve approval (approve/deny) |
| TI-316 | US-5-WEBMCP-06 — Security guardrails (redaction, scopes, CSRF, output caps) |
| TI-317 | US-5-WEBMCP-07 — Demo + tests + docs (Chrome flag/inspector) |

### Definition of Done

- Tools exposés (et testables) dans un navigateur compatible WebMCP (ou via polyfill si décidé).
- Write tools impossibles sans **confirmation** UI + idempotency.
- Aucune fuite PII/secrets via outputs.
- Audit/telemetry + docs d’intégration.

---

## TI-311 — US-5-WEBMCP-01 — Capability detection + feature flag + dev doc

**Type:** Story  
**Priority:** High  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Area/Integrations  
**Parent:** TI-310

### User Story

En tant qu’équipe dev, je veux activer WebMCP **seulement** sur les environnements voulus et détecter proprement le support navigateur.

### Context

WebMCP est une proposition en évolution et (au moment de l’early preview) nécessite l’activation d’un flag Chrome et un inspector pour voir/exécuter les tools.

### Acceptance Criteria

- [ ] **Feature flag**: `WEBMCP_ENABLED` (default: `false` en prod) contrôle l’enregistrement des tools.
- [ ] **Capability detection**: si `navigator.modelContext` n’existe pas, aucune erreur, aucun tool enregistré.
- [ ] **Env isolation**: possibilité d’activer uniquement sur `staging`/`dev`.
- [ ] **Dev doc**: un `WEBMCP_DEV.md` explique:
  - comment activer le flag (Chrome 146 early preview)
  - comment vérifier que les tools sont visibles (inspector extension)
  - comment désactiver (kill switch)

### Implementation Notes (v0)

- Créer un module `webmcp/adapter.ts`:
  - `isWebMCPSupported(): boolean`
  - `registerTools(tools: ToolDef[]): void`
- IMPORTANT: l’API exacte peut bouger, donc wrapper + tests de compat.

### Security / Abuse

- [ ] Ne rien enregistrer sur les pages publiques (marketing) par défaut; uniquement `/app/*`.

### Telemetry

- `webmcp.support_detected` (bool)
- `webmcp.tools_registered` (count)

### Dependencies

- Aucune (peut commencer immédiatement).

### Definition of Done

- Flag + detection + doc PR-ready.

---

## TI-312 — US-5-WEBMCP-02 — Tool registry (read-only: deals/listings/approvals)

**Type:** Story  
**Priority:** High  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security  
**Parent:** TI-310

### User Story

En tant qu’utilisateur, je veux que mon agent in-browser puisse **lire** deals/listings/approvals via des tools structurés (sans DOM scraping).

### Tools (v0 minimal, read-only)

1) `clawdeals.deals_search` → wrapper `GET /v1/deals`
2) `clawdeals.deals_get` → wrapper `GET /v1/deals/{deal_id}`
3) `clawdeals.listings_search` → wrapper `GET /v1/listings` (LIVE-only côté API)
4) `clawdeals.listings_get` → wrapper `GET /v1/listings/{listing_id}`
5) `clawdeals.approvals_list` → wrapper `GET /v1/approvals?state=PENDING`
6) `clawdeals.approvals_get` → wrapper `GET /v1/approvals/{approval_id}`

> Note: Le starter pack réutilise les endpoints existants: pas de nouveaux reads.

### Acceptance Criteria

- [ ] Les 6 tools apparaissent dans l’inspector WebMCP (sur navigateur compatible).
- [ ] Chaque tool a:
  - `name`, `description`
  - `inputSchema` (JSON Schema) + validation stricte
  - output structuré (liste / détail) avec **champs minimisés**
- [ ] En cas d’erreur API:
  - tool renvoie une erreur structurée (code + message) sans fuite de détails sensibles.

### Output minimization (normatif)

- Deals: pas de HTML, pas de blobs; `source_url` optionnel, traité comme **texte** (pas auto-link).
- Approvals: pas de PII, pas de payload brut si sensible (redacted/summary).

### Security / Abuse

- [ ] Aucune donnée non visible dans l’UI n’est retournée (principe « same as UI access »).
- [ ] Cap taille output: ex `max_bytes=16KB` (tronquer liste si nécessaire).

### Telemetry

- `webmcp.tool_invoked` (tool_name, success/failure, latency_ms)

### Dependencies

- TI-311 (adapter + flag)
- Endpoints REST correspondants (Phases 1–3)
- (Recommandé) Convention `X-Client-Channel: webmcp` pour traçabilité.

### Parallélisable

- Peut avancer en parallèle de TI-313 (confirm) car read-only.

### Definition of Done

- Tools read-only publiés + test manuel via inspector.

---

## TI-313 — US-5-WEBMCP-03 — Preview/Confirm gate (required for write tools)

**Type:** Story  
**Priority:** Urgent  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security  
**Parent:** TI-310

### User Story

En tant qu’owner, je veux **voir** et **confirmer** explicitement toute action « write » déclenchée par un agent WebMCP (sinon refuse).

### Acceptance Criteria

- [ ] Toute exécution d’un tool marqué `requires_confirmation=true` déclenche une **modal**:
  - nom du tool + description
  - paramètres (avec redaction si nécessaire)
  - « Ce que l’agent va recevoir en output »
  - boutons: **Approve / Deny / Edit**
- [ ] **Deny**: le tool renvoie une erreur `USER_DENIED`.
- [ ] **Approve**: exécute l’action en injectant:
  - `Idempotency-Key` auto-généré si non fourni (UUID)
  - `X-Client-Channel: webmcp`
- [ ] Timeout: si pas de réponse user en `N` secondes (ex 60s) → deny automatique.

### UX notes (v0)

- Afficher un bandeau « Agent action pending » tant que la modal est ouverte.
- Garder un historique local des 20 dernières actions (debug) avec statut APPROVED/DENIED.

### Security / Abuse

- [ ] Aucune write ne peut être effectuée « silencieusement ».
- [ ] Les paramètres affichés sont **canonisés** (JSON stable) pour éviter les surprises.
- [ ] Si l’agent tente d’enchaîner 10 demandes en 30s → déclencher un cooldown UI (anti-spam).

### Telemetry

- `webmcp.confirm_shown`
- `webmcp.confirm_approved`
- `webmcp.confirm_denied`
- `webmcp.confirm_timeout`

### Dependencies

- TI-311 adapter
- Idempotency (TI-172) côté backend

### Parallélisable

- Peut être fait en parallèle de TI-312 (read-only) et TI-316 (security) tant que les interfaces sont stables.

### Definition of Done

- Gate actif + tests manuels (deny/approve/timeout).

---

## TI-314 — US-5-WEBMCP-04 — Write tool: create listing draft (safe write)

**Type:** Story  
**Priority:** High  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security  
**Parent:** TI-310

### User Story

En tant qu’owner, je veux que mon agent puisse préparer une annonce **en DRAFT** (sans la publier) via WebMCP, pour que je valide ensuite.

### Tool: `clawdeals.listings_create_draft`

**InputSchema (v0)**
- `title` (1..120)
- `description` (0..4000)
- `category` (enum)
- `condition` (enum)
- `price_amount_minor` (int >= 0)
- `currency` (EUR default)
- `geo` (optional `{lat,lng}`) si PostGIS supporté

**Output (v0)**
- `listing_id`
- `status = "DRAFT"`
- `summary` (champs minimisés)

### Acceptance Criteria

- [ ] Invocation depuis WebMCP → passe par la modal TI-313.
- [ ] Après approval:
  - un listing est créé **en DRAFT** (jamais LIVE)
  - l’action est idempotente (Idempotency-Key)
- [ ] Le listing apparaît dans la console « Drafts » (ou via endpoint listing get).
- [ ] Validation stricte des champs (mêmes règles que `POST /v1/listings`).

### API/Schema impact

- Recommandé: réutiliser `POST /v1/listings` avec `status="DRAFT"` ou `publish=false` (à décider).
- Si endpoint actuel ne supporte pas DRAFT: ajouter un param `publish` (default true) ou un endpoint `POST /v1/listings:draft`.

### Security / Abuse

- [ ] Rate limit groupe `listings.create` s’applique (TI-180).
- [ ] Audit `listing.create` (write) existe et inclut `client_channel=webmcp`.

### Telemetry

- `listing.draft_created` (channel=webmcp)

### Dependencies

- TI-193 Create listing (Phase 3)
- TI-313 confirm gate

### Parallélisable

- Peut être développé en parallèle de TI-315 (approvals tool) après TI-313.

### Definition of Done

- Tool fonctionne end-to-end sur staging + tests idempotency + audit.

---

## TI-315 — US-5-WEBMCP-05 — Admin tool: resolve approval (approve/deny)

**Type:** Story  
**Priority:** High  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security  
**Parent:** TI-310

### User Story

En tant qu’owner (ou ops), je veux pouvoir approuver/refuser une approval via un tool WebMCP, avec confirmation explicite.

### Tool: `clawdeals.approvals_resolve`

Input:
- `approval_id` (uuid)
- `decision` (`APPROVE|DENY`)
- `note` (optional, 0..400)

Output:
- `approval_id`
- `state` (`APPROVED|DENIED`)
- `resolved_at`

### Acceptance Criteria

- [ ] L’appel déclenche la modal TI-313 (toujours).
- [ ] Approve/deny appelle les endpoints approvals existants (ou équivalents) et respecte idempotency.
- [ ] Toute résolution est auditée avec actor (owner_id) + décision.
- [ ] En cas de conflict (déjà résolu) → 409 `APPROVAL_ALREADY_RESOLVED`.

### Security / Abuse

- [ ] Authorization: seul owner/ops du scope peut résoudre.
- [ ] Output ne contient pas de payload sensible (summary seulement).

### Telemetry

- `approval.resolved` (channel=webmcp)

### Dependencies

- Approvals queue endpoints (TI-177)
- Policies (TI-176) si exécution d’action dépendante
- TI-313 confirm gate

### Definition of Done

- Résolution approvals via WebMCP OK + audit.

---

## TI-316 — US-5-WEBMCP-06 — Security guardrails (redaction, scopes, CSRF, output caps)

**Type:** Story  
**Priority:** Urgent  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP, Risk/Security  
**Parent:** TI-310

### User Story

En tant que plateforme, je veux que l’activation WebMCP **n’augmente pas** la surface d’exfiltration, de spam ou d’actions non désirées.

### Acceptance Criteria (normatifs)

- [ ] **PII redaction**: tous les outputs tools passent par un sanitizer:
  - email/tel/adresse → supprimés ou hashés
  - tokens/api keys → supprimés
- [ ] **Scopes**: chaque tool a un niveau:
  - `read` (safe)
  - `write` (confirm mandatory)
  - `admin` (confirm + role ops/owner)
- [ ] **CSRF / session safety**:
  - les writes backend exigent CSRF token (ou same-site strict + double submit) quand canal=web
  - vérif `Origin`/`Referer` sur writes
- [ ] **Output caps**: taille max par tool result (ex 16KB) + champs whitelistés.
- [ ] **Rate limits**: bucket additionnel `webmcp.tool_invoke` (ex 120/min/session) pour éviter un agent « noisy ».
- [ ] **Kill switch**: désactivation immédiate via config (coupe enregistrement tools).

### Test Plan

- [ ] Tool read: retourne uniquement champs whitelistés.
- [ ] Tool write: refuse si bypass confirmation (simulate direct call).
- [ ] PII leak tests: inject email/tel dans description → tool output ne le renvoie pas.
- [ ] CSRF: appel cross-origin sans token → 403.

### Dependencies

- TI-311 feature flag
- TI-180 rate limits

### Definition of Done

- Guardrails en place + tests automatisés minimum (unit + integration).

---

## TI-317 — US-5-WEBMCP-07 — Demo + tests + docs (Chrome flag/inspector)

**Type:** Story  
**Priority:** Medium  
**Labels:** Phase/P5, Channel/Web, Channel/WebMCP  
**Parent:** TI-310

### User Story

En tant que dev/QA, je veux une démo reproductible pour valider que WebMCP fonctionne (outillage, scénarios, régression).

### Acceptance Criteria

- [ ] Page interne `/dev/webmcp` (staging-only) qui:
  - liste les tools enregistrés + schémas
  - permet de simuler une invocation (read-only + write via confirm)
- [ ] Doc `WEBMCP.md`:
  - navigateur recommandé + activation flag (si nécessaire)
  - comment utiliser l’inspector extension
  - scénarios tests (read, create draft, resolve approval)
- [ ] E2E smoke tests:
  - vérifie que les tools sont enregistrés quand support détecté (mock `navigator.modelContext`)
  - vérifie que confirm gate bloque les writes

### Dependencies

- TI-311..316

### Definition of Done

- Démo + doc + tests smoke merged.
