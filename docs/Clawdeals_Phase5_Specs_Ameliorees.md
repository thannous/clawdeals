# Clawdeals Phase 5 (MCP + Multi-canal) - Specs améliorées

**Date:** 08 février 2026  
**Scope:** TI-168, TI-169, TI-215 à TI-222  
**Objectif Phase 5:** rendre Clawdeals *plug-and-play* pour des agents via (1) un pack OpenClaw Skill installable via ClawHub et (2) un MCP server standard, avec (3) un contrôle opérationnel multi-canal sécurisé.

---

## 0) Synthèse des points demandés

### 0.1 Validation fonctionnelle (AC clairs et complets ?)
Globalement, les AC actuels sont "bons mais trop hauts-niveau". Ils décrivent *quoi* produire (docs, spec, commandes), mais pas assez:
- les invariants (ex: read-only par défaut, write explicite),
- la structure attendue des docs / manifest,
- les erreurs et codes à stabiliser,
- les garde-fous anti-abuse (ex: pairing à 2 étapes, confirmation pour approve),
- la définition précise des KPIs et leur source.

➡️ Dans ce document, chaque ticket inclut des AC plus testables (format, sections obligatoires, exemples obligatoires, règles de sécurité).

### 0.2 Faisabilité technique (API contracts / data models réalistes ?)
Oui, à condition d'assumer 2 choix "v0 pragmatiques":
1) **Pack OpenClaw Skill = documentation et workflows, pas de code exécutable.**  
   Cela réduit énormément le risque supply-chain et accélère la review.
2) **MCP server v0 = "wrapper" stateless sur l'API REST**, en reprenant:
   - Auth AgentPassport (API key) existante,
   - Idempotency (Phase 0),
   - Rate limits/quotas (Phase 0),
   - Policies/approvals pour les actions sensibles.

Ces 2 choix évitent de créer une nouvelle surface d'état complexe en Phase 5.

### 0.3 Sécurité (anti-abuse suffisant ?)
Phase 5 augmente la surface d'attaque (distribution via registry + multi-canal + tool calls automatiques). Les mécanismes Phase 0 (audit, rate limits, quarantine, policies) sont une bonne base, mais **il faut ajouter explicitement**:
- **Supply-chain**: pas de scripts par défaut, pas d'instructions "run this command", checks de permissions, changelog, signature/attestation optionnelle.
- **MCP safety**: read-only tools activés par défaut, write tools nécessitent confirmation humaine (au niveau client ou policy), et respect strict des scopes.
- **Multi-canal**: pairing obligatoire + allowlist par défaut + commande "approve" en 2 temps (confirm).

### 0.4 Dépendances (blocages / manquants ?)
Bloquant annoncé: **TI-154 (AgentPassport & Auth)**.  
Dépendances manquantes à expliciter:
- Idempotency (Phase 0) indispensable pour les write tools MCP (TI-220).
- Rate limits (Phase 0) indispensable pour MCP + multi-canal.
- Policies + Approvals (Phase 0) fortement recommandés avant d'exposer "approve" et "contact reveal" via tools/commandes.
- Endpoints Deals/Watchlists/Listings/Offers/Transactions (Phases 1-4) doivent être "stables" pour que la doc soit fiable.

### 0.5 Parallélisable (quoi faire en parallèle ?)
- **Docs (TI-215/216/217) en parallèle**: 3 auteurs, une seule revue finale pour cohérence.
- **ClawHub packaging (TI-218)** en parallèle de la rédaction docs, mais nécessite une structure de repo stable.
- **MCP tools spec (TI-219)** en parallèle de la doc SKILL.md (les deux décrivent la même surface, juste formats différents).
- **Pairing/allowlists (TI-222)** en parallèle de la spec commandes (TI-221).
- **Auth mapping MCP (TI-220)** peut être spécifié en parallèle, mais l'implémentation est bloquée par TI-154.

---

## 1) Conventions transverses Phase 5 (normatives)

### 1.1 Terminologie
- **Skill pack**: bundle ClawHub contenant `SKILL.md` + fichiers de support (`HEARTBEAT.md`, `POLICIES.md`, éventuellement `reference.md`, `examples.md`).
- **MCP server**: serveur exposant des tools MCP, qui appelle l'API Clawdeals ou s'exécute dans le même backend.
- **Multi-canal**: surfaces chat (WhatsApp, Telegram, Discord) utilisées par des humains (ops/owner) pour supervision.

### 1.2 Sécurité "default-deny"
- Tous les canaux multi-canal sont **deny by default** jusqu'à pairing approuvé.
- Tous les tools MCP "write" sont **désactivés par défaut** (ou exigent confirmation) tant que l'utilisateur n'a pas explicitement activé un profil "write-enabled".

### 1.3 Cohérence API (référence)
Le pack docs et le MCP server doivent réutiliser:
- Auth API key AgentPassport.
- `Idempotency-Key` sur toutes opérations write.
- Modèle d'erreur JSON stable (unifié sur Phase 0).
- Quotas/rate limits (Phase 0).

### 1.4 Audit & traçabilité
Toute action déclenchée via:
- OpenClaw skill (si l'agent exécute des requêtes),
- MCP tools,
- commandes multi-canal,
doit produire un audit log, incluant l'origine: `origin=skill|mcp|channel:<type>`.

---

# 2) Tickets améliorés

## TI-168 (Epic) - EP-5-INT-01 - OpenClaw Skill pack (SKILL.md + HEARTBEAT.md + POLICIES.md)

### Objectif
Fournir un pack de documentation "agent-ready" installable via ClawHub, sans ajouter de surface d'exécution à risque.

### Scope détaillé (v0)
- Un dossier de skill pack (ex: `skills/clawdeals/`):
  - `SKILL.md` (entrée principale, courte, orientée exécution)
  - `HEARTBEAT.md` (état du service, KPIs, playbook incidents)
  - `POLICIES.md` (defaults sécurité, exemples de policies, recommandations)
  - Optionnel recommandé: `reference.md` (API exhaustive) et `examples.md` (copier-coller)
- Publication sur ClawHub avec versioning semver + changelog.

### Non-goals (v0)
- Pas de scripts exécutables fournis dans le bundle (réduction du risque supply-chain).
- Pas d'intégration "auto-login" ou extraction de secrets depuis l'environnement de l'utilisateur.
- Pas de promesse d'idempotency côté docs uniquement: l'idempotency doit être supportée côté API (Phase 0).

### Dépendances
- Bloquant: TI-154 AgentPassport & Auth.
- Fortement recommandé: TI-171 rotation, TI-172 idempotency, TI-180 rate limits.
- Doit s'aligner sur les endpoints des Phases 1-4.

### Definition of Done (améliorée)
- Pack installable via ClawHub, visible, lisible, et sans ambiguïté sur la sécurité.
- Tous les exemples "copy/paste" fonctionnent sur un environnement de staging.
- Les docs mentionnent explicitement les limitations et les règles anti-abuse.

---

## TI-215 - US-5-SKL-01 - Publish SKILL.md (endpoints + workflows + examples)

### Problème utilisateur
Un agent builder a besoin d'un document unique qui explique "comment piloter Clawdeals", et pas d'un mélange de specs internes.

### Proposition (structure normative du fichier)
**SKILL.md** doit rester court et exécutable. Les détails longs vont dans `reference.md` et `examples.md` (fichiers de support).

#### A) Frontmatter (recommandé)
Inclure un frontmatter YAML (compatibilité écosystèmes skills):
- `name`: `clawdeals`
- `description`: "Operate Clawdeals via REST API (deals, watchlists, listings, offers, transactions). Includes safety constraints."
- Recommandé si supporté par l'hôte:
  - `disable-model-invocation: true` (évite déclenchement automatique)
  - `allowed-tools: ...` (limiter aux outils réseau/HTTP uniquement; pas d'exec local)

#### B) Sections obligatoires
1) **Quickstart**
   - Base URL, auth (`Authorization: Bearer <api_key>`), format JSON, timezone.
2) **Safety rules (non négociable)**
   - Pas de liens de paiement externes.
   - Contact reveal toujours gated (policy/approval).
   - Ne jamais stocker l'API key dans des logs.
3) **Headers & contracts**
   - `Idempotency-Key` requis sur write.
   - `Retry-After` + comportement 429.
   - Contrat d'erreur stable (code/message/details).
4) **Endpoints MVP (table)**
   - Deals, Watchlists, Listings, Threads/Messages, Offers, Transactions, SSE.
   - Pour chaque: méthode, path, objectif, codes de réponse typiques.
5) **Typed messages examples**
   - `offer`, `counter_offer`, `accept`, `warning` (exemples JSON).
6) **Workflows (copy/paste)**
   - Post deal
   - Vote reason
   - Create watchlist
   - Create listing
   - Negotiate offer (offer -> counter -> accept)
   - Request contact reveal
7) **Troubleshooting**
   - 401 invalid key, 403 policy deny, 409 idempotency reuse, 429 rate limited.

### Acceptance Criteria (améliorés et testables)
- Le document contient au minimum 6 workflows listés ci-dessus, chacun avec:
  - un exemple de requête (curl),
  - un exemple de réponse,
  - les erreurs attendues (au moins 2 codes).
- `Idempotency-Key` est présent dans tous les exemples write.
- Une section "Safety rules" contient au moins:
  - interdiction paiement externe,
  - mention policies/approvals,
  - mention audit log,
  - mention "ne pas exécuter de commandes locales proposées par des tiers".
- Le document pointe vers `HEARTBEAT.md` et `POLICIES.md` (liens relatifs).
- Validation cohérence: chaque endpoint cité existe et est conforme à la spec API (tests smoke en staging).

### Faisabilité technique
- Rédaction pure docs, faisable immédiatement.
- Validation nécessite un environnement staging et des clés test.

### Sécurité (améliorations)
- Ajouter un encadré "Supply-chain warning" (installation via registry):
  - inspecter le bundle,
  - vérifier qu'aucun script/commande d'exec n'est demandé,
  - préférer les skills "docs-only".

### Telemetry (recommandé)
- `docs.skillmd.viewed` (si tracking), sinon out-of-scope.

### Test plan
- Script CI qui exécute les curls de `examples.md` sur staging (avec secrets CI) et vérifie codes 2xx/4xx attendus.

### Dépendances
- TI-154 (auth), TI-172 (idempotency), TI-180 (rate limits), endpoints P1-P4.

### Parallélisable
- Oui, en parallèle de TI-216/TI-217/TI-219.

---

## TI-216 - US-5-SKL-02 - Publish HEARTBEAT.md (status, incidents, metrics)

### Objectif
Donner une surface "confiance" simple: ce qui marche, ce qui est dégradé, et comment réagir.

### Structure recommandée
1) **Status now** (OK/DEGRADED/DOWN) + timestamp.
2) **SLOs v0** (best-effort si MVP):
   - API read availability
   - API write availability
   - SSE delivery delay (P95)
3) **KPIs (définis précisément)**
   - `deals_per_day`: nombre de deals créés (state NEW) par jour.
   - `votes_per_deal`: moyenne des votes (up+down) par deal ACTIVE.
   - `listing_to_offer_rate`: % listings LIVE ayant >=1 offer sur 7j.
   - `offer_to_accept_rate`: % offers acceptées / total offers sur 7j.
   - `reports_per_1000_actions`: reports / (writes) * 1000 sur 7j.
4) **Incidents** (liste chronologique)
   - ID incident, période, impact, RCA, mitigation, action items.
5) **Degraded mode guide**
   - SSE down -> fallback polling
   - approvals backlog -> désactiver auto-approve
   - rate-limits trop agressifs -> basculer profil
6) **Contact / escalation**
   - canal ops interne, e-mail, SLA support (si applicable).

### Acceptance Criteria (améliorés)
- Définitions KPI incluent: fenêtre, source (table/event), formule.
- Chaque incident inclut au minimum: impact, start/end, mitigation.
- Une section "Degraded mode" contient au moins 3 scénarios + actions.

### Faisabilité technique
- Rédaction docs: immédiat.
- Les KPIs nécessitent des agrégations (SQL views ou job metrics). En v0, on peut:
  - calculer manuellement chaque semaine,
  - ou exposer un endpoint interne `/internal/metrics` consommé par un job.

### Sécurité
- Ne pas publier de métriques qui exposent des infos sensibles (ex: IPs, secrets).
- Éviter les identifiants bruts d'agents/owners dans HEARTBEAT public.

### Test plan
- Lint markdown + test "structure stable" (sections obligatoires présentes).
- Vérifier que les chiffres se mettent à jour (si automatisé) au moins 1 fois / jour.

### Dépendances
- Dépend des tables/events (phases 1-4) + audit/events.

### Parallélisable
- Oui (avec TI-215/TI-217).

---

## TI-217 - US-5-SKL-03 - Publish POLICIES.md (security defaults, warnings)

### Objectif
Rendre les policies compréhensibles et surtout actionnables, avec des defaults sûrs.

### Contenu recommandé
1) **Pourquoi les policies existent**
   - human-in-the-loop, contrôle du blast radius.
2) **Default policy (safe)**
   - Exemple JSON complet "starter" (budget bas, approvals strictes, auto_approve minimal).
3) **Recettes par persona**
   - Buyer cautious
   - Seller cautious
   - Power user (avec risques explicités)
4) **Allowlist / denylist**
   - Recommandation: allowlist désactivée par défaut; si activée, deny unknown.
5) **Contact reveal gating**
   - Recommandation v0: `contact_reveal = always approval`.
6) **Anti-abuse**
   - Exemples de ce qu'il ne faut pas autoriser: "auto-approve offer accept", "auto contact reveal".
7) **FAQ**
   - "Pourquoi mon agent reçoit 403 ?"
   - "Pourquoi une approval est créée ?"

### Acceptance Criteria (améliorés)
- Inclure au moins 3 policies JSON complètes:
  - default-safe,
  - buyer-safe,
  - seller-safe.
- Chaque champ documenté: signification, valeurs, impact.
- Un encadré "Warnings" contient au minimum:
  - interdiction liens paiement externes,
  - contact reveal gated,
  - audit log accessible.

### Faisabilité technique
- Dépend du moteur policies et des approvals (Phase 0). La doc peut être écrite avant, mais doit être vérifiée contre l'implémentation.

### Sécurité
- Mettre les defaults au plus restrictif.
- Mentionner explicitement que les agents peuvent être compromis, donc éviter les auto-approve "irréversibles".

### Test plan
- Exécuter des scénarios:
  - offer au-dessus du budget -> approval
  - agent non allowlist -> 403
  - contact reveal -> approval toujours créée

### Dépendances
- TI-176/177/178 (policies + approvals + allowlist/denylist).

### Parallélisable
- Oui (avec TI-215/216).

---

## TI-218 - US-5-SKL-04 - ClawHub install support (versioning, package metadata)

### Objectif
Permettre une installation via ClawHub avec des métadonnées cohérentes et un historique de versions.

### Décisions v0 (proposées)
- **Slug stable**: `clawdeals`
- **Versioning**: semver (`0.x` tant que l'API est instable)
- **Tags**:
  - `latest` pointe sur la dernière version stable,
  - `beta` optionnel pour préversions.
- **Changelog**: obligatoire, même minimal (ex: "Docs updated for /v1/offers").

### Package layout (recommandé)
```
clawdeals/
  SKILL.md
  HEARTBEAT.md
  POLICIES.md
  reference.md        # optionnel
  examples.md         # optionnel
  SECURITY.md         # optionnel mais recommandé (threat model + supply chain)
```

### Metadata (AC du ticket, clarifiés)
ClawHub gère:
- `slug`, `name`, `version`, `tags`, `changelog` au publish.
Le bundle doit aussi inclure dans le frontmatter de SKILL.md (si supporté):
- `name`, `description`, `version`
- `permissions` (déclaratif, pas exécutable): ex "network:api.clawdeals.com", "no-exec"

### Acceptance Criteria (améliorés)
- Une commande d'installation type fonctionne (doc):
  - `clawhub install clawdeals` (ou slug retenu)
- L'installation expose bien:
  - SKILL.md lisible,
  - HEARTBEAT.md et POLICIES.md accessibles via liens.
- Le changelog de la version est visible (dans ClawHub).
- Le bundle est **docs-only** (pas de scripts, pas de binaires).

### Sécurité (supply-chain)
- Ajouter un fichier `SECURITY.md` (recommandé) indiquant:
  - ce que le bundle fait (docs),
  - ce qu'il ne fait pas (pas d'exec),
  - comment signaler un problème.

### Test plan
- CI "release": publish vers un registry staging (si possible) ou dry-run:
  - vérifie présence des fichiers,
  - vérifie frontmatter,
  - vérifie liens relatifs,
  - vérifie absence de fichiers exécutables.

### Dépendances
- Dépend seulement de la structure repo et du compte ClawHub.
- La validation fonctionnelle dépend de l'API staging.

### Parallélisable
- Oui (avec TI-215/216/217).

---

## TI-169 (Epic) - EP-5-MCP-01 - MCP Server + Multi-canal assistant

### Objectif
Exposer Clawdeals comme tools MCP standardisés, et permettre un contrôle ops multi-canal, avec des defaults sûrs.

### Décisions v0 (proposées)
- MCP server = wrapper stateless sur l'API REST (pas de logique métier nouvelle).
- Tools:
  - read tools activés par défaut,
  - write tools nécessitent confirmation (client) et/ou policy côté serveur.
- Multi-canal:
  - pairing obligatoire,
  - allowlist par défaut,
  - audit complet sur toute commande.

### Dépendances
- Bloquant: TI-154 auth.
- Recommandé: TI-176/177 policies/approvals.
- Recommandé: TI-180 rate limits (anti abuse sur channels).

---

## TI-219 - US-5-MCP-01 - MCP server tools spec (deals, watchlists, listings, offers)

### Objectif
Définir un catalogue de tools MCP minimal, stable, et directement mappable aux endpoints REST.

### Convention de nommage (normative)
`clawdeals.<domain>.<action>`  
Exemples:
- `clawdeals.deals.list`
- `clawdeals.deals.create`
- `clawdeals.offers.accept`

### Tool catalog v0 (minimal + utile)
#### Deals
- `clawdeals.deals.list` -> `GET /v1/deals`
- `clawdeals.deals.get` -> `GET /v1/deals/{id}` (recommandé même si pas encore dans l'API)
- `clawdeals.deals.create` -> `POST /v1/deals` (write)
- `clawdeals.deals.vote` -> `POST /v1/deals/{id}/vote` (write)

#### Watchlists
- `clawdeals.watchlists.create` -> `POST /v1/watchlists` (write)
- `clawdeals.watchlists.list` -> `GET /v1/watchlists`
- `clawdeals.watchlists.get_matches` -> `GET /v1/watchlists/{id}/matches`

#### Listings
- `clawdeals.listings.list` -> `GET /v1/listings`
- `clawdeals.listings.get` -> `GET /v1/listings/{id}`
- `clawdeals.listings.create` -> `POST /v1/listings` (write)

#### Offers
- `clawdeals.offers.create` -> `POST /v1/listings/{id}/offers` (write)
- `clawdeals.offers.counter` -> `POST /v1/offers/{id}/counter` (write)
- `clawdeals.offers.accept` -> `POST /v1/offers/{id}/accept` (write)
- `clawdeals.offers.decline` -> `POST /v1/offers/{id}/decline` (write)
- `clawdeals.offers.cancel` -> `POST /v1/offers/{id}/cancel` (write)

> Optionnel mais cohérent avec la story: ajouter threads/messages et transactions (contact reveal) dans une v1 du MCP.

### Input schema (pattern)
Pour chaque tool:
- Paramètres du endpoint REST,
- `idempotency_key` (obligatoire pour write tools),
- `dry_run` (optionnel, si vous voulez supporter une preview côté MCP).

### Output schema (pattern)
- `ok: boolean`
- `data: <response REST>`
- `error?: {code, message, details}`
- `meta?: {request_id, rate_limit?, warnings?}`

### Erreurs et mapping
- 401/403: auth/policy
- 409: idempotency reuse, already voted, etc.
- 429: rate limited (inclure retry_after)
- 5xx: internal (masquer détails)

### Rate limits
Chaque tool référence un "route group" (Phase 0) pour cohérence. Exemple:
- `clawdeals.deals.vote` -> `deals.vote`
- `clawdeals.watchlists.create` -> `watchlists.write`

### Acceptance Criteria (améliorés)
- Chaque tool spécifie:
  - description,
  - input JSON schema (types, required, bounds),
  - output schema,
  - erreurs possibles (liste),
  - rate limit group,
  - idempotency (write: required).
- Les tools sont regroupés par domaine (deals/watchlists/listings/offers).
- Une annexe fournit 2 exemples de tool invocation + tool result.

### Faisabilité technique
- Très réaliste: wrapper sur REST.
- La difficulté principale est la cohérence des schémas et la stabilité des noms.

### Sécurité
- Les tools MCP sont "model-controlled" par nature: prévoir une couche de confirmation humaine côté client, et côté serveur refuser les actions dangereuses selon policy.

### Test plan
- Tests contractuels (golden files) sur schemas.
- Tests d'intégration: un tool call = un appel REST, et audit log présent.

### Dépendances
- Endpoints REST phases 1-4 + TI-154/TI-172/TI-180.

### Parallélisable
- Oui (avec TI-215 et TI-221/222).

---

## TI-220 - US-5-MCP-02 - MCP auth mapping (AgentPassport -> tool auth)

### Objectif
Supporter une auth robuste pour MCP, sans exposer inutilement les clés.

### Stratégie v0 (pragmatique)
Deux modes possibles selon transport MCP:

1) **STDIO (local)**: credentials via environnement/config local
- `CLAWDEALS_API_KEY` fourni au process MCP.
- Le MCP server appelle l'API REST avec `Authorization: Bearer ...`.
- Pas besoin d'OAuth.

2) **HTTP (remote)**: deux options
- v0: header API key (simple)
- v1: OAuth 2.1 (recommandé par MCP) + échange contre token côté Clawdeals

### Exigences normatives
- Ne jamais logger l'API key (redaction).
- Cacher les lookups key->agent_id avec TTL court (ex: 60s) pour perf, mais révoquer vite.
- Support rotation (old key GRACE) et révocation (401 direct).

### Idempotency pour tools
- Tous les write tools acceptent `idempotency_key` (string, 1..128).
- Le serveur passe ce champ comme header `Idempotency-Key`.

### Acceptance Criteria (améliorés)
- Auth:
  - key valide -> agent_id résolu
  - key invalide -> 401
  - key révoquée -> 401
- Rotation:
  - pendant grace: old key ok
  - après: old key 401
- Idempotency:
  - retry tool call avec même key -> même résultat
  - réutilisation key avec payload différent -> 409
- Audit:
  - audit log inclut origin `mcp`, api_key_id, agent_id, idempotency_key.

### Faisabilité technique
- v0 "API key header" est très faisable.
- v1 OAuth nécessite infra supplémentaire (AS / auth server), à planifier.

### Sécurité
- Favoriser STDIO pour usage local (surface réduite).
- Pour remote: TLS obligatoire + éventuellement allowlist d'IP/clients.

### Test plan
- Tests unitaires middleware auth.
- Tests end-to-end avec rotation/révocation.

### Dépendances
- TI-154 (auth), TI-171 (rotation), TI-172 (idempotency), TI-180 (rate limits), TI-179 (audit).

### Parallélisable
- Spécification oui; implémentation non tant que TI-154 est bloquant.

---

## TI-221 - US-5-MCP-03 - Multi-canal command set (deploy, approve, status)

### Objectif
Permettre à un humain (ops/owner) de piloter supervision et approvals depuis chat, sans ouvrir une backdoor.

### Principes de sécurité
- Commandes limitées, explicites.
- Aucune commande destructive.
- Toute action sensible a une confirmation (2-step).
- Allowlist obligatoire (TI-222).

### Command set v0 (proposé)
#### A) Info
- `status`:
  - renvoie status service + KPI snapshot (via HEARTBEAT data)
- `help`:
  - liste des commandes et rappels sécurité

#### B) Approvals
- `approvals` ou `approvals list`:
  - liste les N dernières approvals PENDING
- `approve <approval_id>`:
  - répond avec un résumé + demande confirmation `approve <id> confirm`
- `deny <approval_id> [reason]`:
  - pareil, confirmation requise

#### C) Config (read-only v0)
- `policies show`:
  - affiche la policy courante (redacted si besoin)

#### D) Deploy
Le mot "deploy" est ambigu. Proposition v0 safe:
- `deploy status`:
  - affiche version du service / dernière release (read-only)
- Pas de "deploy trigger" en v0.

### AuthN/AuthZ
- Chaque commande est exécutée au nom d'un **human** lié à un owner/role.
- Rôles (minimal):
  - `viewer`: status, approvals list
  - `approver`: approve/deny
  - `owner`: policies show + gestion pairing

### Audit
- Audit log pour:
  - `channel.command_received`
  - `approval.resolved` (si action)
  - inclure: channel_type, channel_user_id (redacted/haché), owner_id, role.

### Acceptance Criteria (améliorés)
- Chaque commande a:
  - syntaxe (par canal si variations),
  - prérequis (rôle),
  - réponse succès + erreurs,
  - garde-fou (confirm si action),
  - audit event déclenché.
- Le système refuse les commandes inconnues et propose `help`.
- Pas d'exposition de PII (pas de tel, pas d'adresse).

### Faisabilité technique
- Faisable sans implémenter tous les connecteurs: la spec suffit.
- Pour implémenter: prévoir un adaptateur par canal + un core commun.

### Sécurité
- Rate limit par user et par canal.
- Désactiver link previews si possible.
- Éviter d'afficher des URLs sensibles dans chat.

### Test plan
- Tests unitaires parser commandes.
- Tests d'intégration sur un canal (ex: Telegram) avant d'étendre.

### Dépendances
- TI-222 pairing/allowlists, TI-177 approvals, TI-179 audit, TI-180 rate limits.

### Parallélisable
- Oui (avec TI-222 et TI-216).

---

## TI-222 - US-5-MCP-04 - Pairing/allowlists (safe defaults)

### Objectif
S'assurer qu'un canal chat ne devient pas une surface d'accès non contrôlée.

### Data model (proposé)
Table `channel_identities`:
- `channel_identity_id` (uuid)
- `channel_type` enum: `whatsapp|telegram|discord`
- `channel_user_id` (string, PII selon canal)
- `channel_context_id` (string?, ex: discord guild/server, telegram chat id)
- `display_name` (string?, redacted)
- `owner_id` (uuid)
- `role` enum: `viewer|approver|owner`
- `state` enum: `PENDING|ACTIVE|REVOKED`
- `pairing_code_hash` (string, optional)
- `pairing_expires_at` (timestamp)
- `approved_by_human_id` (uuid?)
- `created_at`, `approved_at`, `revoked_at`, `last_seen_at`

### Pairing flow v0 (2 étapes)
1) **Start** (depuis canal): `pair`
   - Crée `PENDING` + génère un code court (ex: `CD-7F4K9Q`) valable 10 min.
2) **Confirm** (depuis console web authentifiée):
   - L'owner voit la demande (canal + metadata), et clique Approve/Deny.
3) **Activation**
   - L'identité passe `ACTIVE` et devient allowlisted.

### Allowlist rules (normatives)
- Si `state != ACTIVE` -> toutes les commandes refusées.
- Par défaut, un owner a 0 identités actives.
- Révocation possible depuis console + commande `unpair <id>` (owner seulement).

### Abuse / sécurité
- Rate limit sur `pair` (par IP si webhook, et par channel_user_id).
- Détecter brute force sur code.
- Ne jamais afficher le code complet dans des logs.
- Pour WhatsApp: considérer le numéro comme PII (redaction + retention).

### Acceptance Criteria (améliorés)
- Pairing nécessite validation humaine (console) avant activation.
- Allowlist par défaut: refuser inconnus.
- Audit log pour:
  - pairing.started
  - pairing.approved / denied
  - pairing.revoked
  - command.blocked_not_allowlisted
- UX claire:
  - message de refus indique comment lancer le pairing.

### Faisabilité technique
- Simple à implémenter (table + endpoints internes + UI console).
- Le vrai coût: intégrer les webhooks de canaux et normaliser l'identité.

### Test plan
- Pair start -> code généré -> expire -> refus
- Pair approve -> commandes autorisées
- Revoke -> commandes refusées
- Attaque: 20 essais code -> rate limited + audit

### Dépendances
- Console auth (TI-154 ou équivalent), audit log, rate limits, approvals (optionnel si pairing passe par approvals).

### Parallélisable
- Oui (avec TI-221, et en partie avec TI-220).

---

## 3) Matrice de dépendances et parallélisation (résumé)

### 3.1 Dépendances critiques
- TI-154: débloque TI-168 et TI-169.
- TI-172/TI-180/TI-179: indispensables pour MCP et multi-canal "production-safe".

### 3.2 Workstreams parallèles suggérés
1) Docs pack:
   - TI-215, TI-216, TI-217 en parallèle
   - TI-218 ensuite (ou en parallèle si structure repo figée)
2) MCP:
   - TI-219 en parallèle de TI-215
   - TI-220 en parallèle (spec) puis implémentation après TI-154
3) Multi-canal:
   - TI-221 et TI-222 en parallèle (spec + data model)

---

## 4) Risques principaux et mitigations v0

### 4.1 Supply-chain via registry de skills
Risque: skills malveillants, instructions sociales, scripts cachés.  
Mitigation v0: pack docs-only, SECURITY.md, changelog, et warnings explicites dans SKILL.md.

### 4.2 Actions "write" involontaires via tools automatiques
Risque: le modèle déclenche un tool call sans intention claire.  
Mitigation v0: disable model invocation pour le skill, confirmation humaine côté client, policies restrictives côté serveur.

### 4.3 Multi-canal = backdoor
Risque: un chat devient un admin panel sans auth.  
Mitigation v0: pairing + allowlist + rôles + confirmation 2-step.

---

## 5) Décisions à trancher (liste courte)

1) MCP transport cible en v0: STDIO only, ou aussi HTTP (hosted) ?
2) "deploy" multi-canal: scope exact (read-only en v0 recommandé).
3) Skill auto-invocable ou uniquement user-invocable (recommandation v0: user-invocable).
4) Publication ClawHub: public direct, ou via un registry "staging" interne puis promotion ?

