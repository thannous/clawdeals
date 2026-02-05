# Audit couverture tests — Phase 0 (TI-170…TI-223)

Date: 2026-02-05
Équipe Linear: Ti-Max
Source: issues Linear (TI-170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 223) + specs locales `docs/tickets-phase-0.md`, `docs/Clawdeals_Phase0_Specs_Ameliorees.md`.

## Résumé global
- **Tickets analysés**: 12
- **Couverture forte (unit + intégration sur critères clés)**: 1
- **Couverture partielle**: 11
- **Couverture manquante**: 0 (mais certains tickets n’ont que des tests très partiels)

### Gaps prioritaires (à traiter en premier)
1. **TI-223 Owner verification**: aucun test API (start/confirm email/phone, lockout, rate limits, audit). Ajouter tests unitaires API + intégration complète.
2. **TI-175 Reports v0**: pas de tests API (validation, duplicate, auto-hide, audit) — seulement poids + rate limit partiel.
3. **TI-177 Approvals queue**: pas de tests unitaires API (list/approve/deny), pas de test deny/pagination/idempotency.
4. **TI-179 Audit log**: couverture limitée aux flows “agent.registered”/“deal.create”/“deal.state_changed”/“deal.temperature_updated”. Manque “BLOCKED/FAILURE” + autres writes.
5. **TI-172 Idempotency**: pas de tests concurrence (IN_PROGRESS) ni encryption payload secret/TTL purge.

---

## Cartographie ticket → tests

### TI-170 — Register agent (AgentPassport)
**Critères clés (Linear)**: création nominale + trust baseline, idempotency replay, validation name, rate limit IP, audit `agent.registered`.

**Tests unitaires**
- `src/pages/api/v1/agents.test.js`
  - validation Idempotency-Key
  - validation name length
  - création nominale + trust_score/flags

**Tests intégration**
- `e2e/api.integration.spec.js`
  - `register agent idempotency + audit`
  - `register agent idempotency misuse returns 409`
  - `rate limit register agent` *(skippé hors NODE_ENV=production)*

**Couverture**: ✅ **Couvert (unit + intégration)**

**Gaps / recommandations**
- Valider explicitement headers rate-limit (`Retry-After`, `X-RateLimit-*`) en intégration.

---

### TI-171 — Rotate/Revoke API key
**Critères clés**: rotate idempotent, revoke immédiat, grace period, 401 après expiration, rate limit, audit events.

**Tests unitaires**
- `src/pages/api/v1/agents/[id]/action.test.js`
  - auth owner, validation agent id, 403 owner mismatch
  - rotate/revoke + Idempotency-Key required

**Tests intégration**
- `e2e/api.integration.spec.js`
  - `rotate and revoke api keys`
  - `revoked and grace-expired keys are rejected`
  - `grace key not expired still works`
  - `rotate idempotency misuse returns 409`

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Tester **audit events** `agent.key_rotated`/`agent.key_revoked`.
- Tester **concurrence** (une seule ACTIVE/GRACE à la fin).
- Tester **rate limit** spécifique rotations/revokes.

---

### TI-172 — Idempotency keys sur endpoints write
**Critères clés**: replay stable, key reuse → 409, concurrence → IN_PROGRESS, encryption réponses sensibles, TTL purge.

**Tests unitaires**
- `src/server/idempotency/crypto.test.js` (HMAC + encryption)
- `src/server/utils/canonical-json.test.js` (canonical JSON)
- enforcement Idempotency-Key sur endpoints write:
  - `src/pages/api/v1/agents.test.js`
  - `src/pages/api/v1/deals.test.js`
  - `src/pages/api/v1/deals/[deal_id]/vote.test.js`
  - `src/pages/api/v1/agents/[id]/action.test.js` (rotate)

**Tests intégration**
- `e2e/api.integration.spec.js`
  - replay stable (agents + deals + votes)
  - key reuse → 409 (agents + rotate)

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Ajouter test **concurrence** ⇒ `IDEMPOTENCY_IN_PROGRESS`.
- Ajouter test **encryption** des réponses sensibles (api_key) + **TTL purge**.

---

### TI-223 — Owner model + verification
**Critères clés**: GET/PATCH owner, start/confirm email/phone, lockout, rate limits, audit sans PII.

**Tests unitaires**
- `src/server/utils/owner-verification.test.js` (normalize/hash/evaluate challenge)

**Tests intégration**
- `e2e/api.integration.spec.js` utilise `createOwner()` → `PATCH /v1/owner` (couverture partielle)

**Couverture**: ⚠️ **Partielle (faible)**

**Gaps / recommandations**
- Tests unitaires API `src/pages/api/v1/owner/index.js` (GET/PATCH validations, reset verified_at).
- Tests unitaires API `src/pages/api/v1/owner/[action].js` (start/confirm email & phone, lockout, expired/consumed).
- Tests intégration pour tout le flow (start → confirm → verified) + audit.
- Tests rate limit `verify-*:start`/`confirm`.

---

### TI-173 — TrustScore baseline
**Critères clés**: baseline à création, verification points, flags, job recalcul.

**Tests unitaires**
- `src/server/trustscore/compute.test.js` (age points, verification points, base flags)

**Tests intégration**
- Aucun test dédié.

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Test d’intégration job recalcul (update trust_score après vérif owner).
- Tester intégration flags (ex: restricted bloque action).

---

### TI-174 — Quarantine
**Critères clés**: quarantine J+0/J+10, flags incident, multipliers appliqués, audit.

**Tests unitaires**
- `src/server/trustscore/quarantine.test.js` (quarantine + multipliers + weights)

**Tests intégration**
- Aucun test dédié.

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Vérifier audit log des multipliers appliqués.
- Couvrir intégration sur actions (report/message/deal) avec poids réduits.

---

### TI-175 — Reports v0
**Critères clés**: create report, dedupe owner, auto-hide seuil + diversité, quarantined = no hide, audit.

**Tests unitaires**
- `src/server/services/reports.test.js` (computeReportWeight)

**Tests intégration**
- `e2e/api.integration.spec.js` → `rate limit reports create` *(skippé hors NODE_ENV=production)*

**Couverture**: ⚠️ **Partielle (très faible)**

**Gaps / recommandations**
- Tests unitaires API `src/pages/api/v1/reports.js` (validation, duplicate, errors).
- Tests intégration: create report OK + audit + `report_weight` attendu.
- Tests auto-hide (diversité owners + seuil pondéré).
- Tests quarantine: report_weight=0 et pas d’auto-hide.

---

### TI-176 — Policy engine v0
**Critères clés**: GET/PUT policy, budget > max ⇒ approval, allowlist/denylist, audit.

**Tests unitaires**
- `src/server/policy/evaluate.test.js` (decision offer/message/action)
- `src/pages/api/v1/policies.test.js` (GET/PUT + validation)

**Tests intégration**
- `e2e/api.integration.spec.js` → `policy get/put as owner`
- `e2e/api.integration.spec.js` → creation approvals via policy (thread/message)

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Tester audit décision policy.
- Tester `If-Match`/version mismatch (si supporté).
- Tester allowlist/denylist via policy sur plusieurs endpoints (message/offer).

---

### TI-177 — Approvals queue
**Critères clés**: list paginée, approve/deny idempotent, executor une seule fois, audit.

**Tests unitaires**
- `src/server/services/approvals.test.js` (cursor encode/decode)

**Tests intégration**
- `e2e/api.integration.spec.js` → `approvals queue executes thread + message actions`

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Tests unitaires API `/v1/approvals` (list/approve/deny).
- Tests **deny** (state DENIED + action non exécutée).
- Tests pagination/cursor.
- Tests idempotency approve/deny (replay stable).

---

### TI-178 — Allowlist/Denylist agents
**Critères clés**: allowlist active deny non-listé, denylist override, audit `policy.blocked_sender`.

**Tests unitaires**
- `src/server/policy/allowlist.test.js` (allow/deny rules)
- `src/server/policy/enforce-allowlist.test.js` (ctx.policy + blocked)

**Tests intégration**
- `e2e/api.integration.spec.js` → `allowlist blocks thread creation`

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Ajouter intégration pour **denylist override**.
- Couvrir enforcement sur `message.send` et `offer.create`.
- Vérifier audit log `policy.blocked_sender` persistant.

---

### TI-179 — Audit log (write actions)
**Critères clés**: audit SUCCESS/FAILURE/BLOCKED pour chaque write, redaction, rétention.

**Tests unitaires**
- `src/server/audit/redaction.test.js` (redaction)

**Tests intégration**
- `e2e/api.integration.spec.js`
  - audit `agent.registered`
  - audit `deal.create`
  - audit `deal.state_changed`
  - audit `deal.temperature_updated`

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Tests de **FAILURE** et **BLOCKED** (policy/allowlist/quarantine).
- Tests “audit même en cas d’exception”.
- Vérifier redaction PII sur payloads variés.

---

### TI-180 — Rate limits & quotas v0
**Critères clés**: 429 + headers, groupes clés, SSE limits.

**Tests unitaires**
- `src/server/rate-limit/config.test.js` (formatLimitLabel)

**Tests intégration**
- `e2e/api.integration.spec.js` → `rate limit register agent`
- `e2e/api.integration.spec.js` → `rate limit reports create`
  *(les deux skippés hors NODE_ENV=production)*

**Couverture**: ⚠️ **Partielle**

**Gaps / recommandations**
- Vérifier **headers** (`Retry-After`, `X-RateLimit-*`).
- Couvrir plusieurs route groups (messages.send, listings.create, deals.create).
- Tester SSE concurrent limit.
- Tester profil quarantine (si activé).

