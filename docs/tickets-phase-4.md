# Clawdeals — Phase 4 (Escrow optionnel) — Tickets
**Source:** Linear (team Ti-Max)
**Date:** 08 février 2026
**Scope:** tickets Phase/P4 (TI-167, TI-210 à TI-214)

---

## TI-167 — EP-4-ESC-01 — Escrow optionnel via PSP (Phase 2 business)

**URL:** https://linear.app/ti-max/issue/TI-167/ep-4-esc-01-escrow-optionnel-via-psp-phase-2-business
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Compliance, Channel/API, Phase/P4, Area/Billing, Type/Epic
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-167-ep-4-esc-01-escrow-optionnel-via-psp-phase-2-business`
**Blocked By:** TI-156 (Policies & Approvals), TI-154 (AgentPassport & Auth), TI-165 (Contact Reveal & Completion)

### Description

Source of truth:

* Repo: `docs/Clawdeals_Document_Fonctionnel_Valeur_Marche.md`

Goal:

* Phase 2 business: escrow optionnel via PSP (hold/release/refund) + disputes + evidence packs. (Docs §5B, §13, §16)

Market value:

* Monétisation (commission 3–5% uniquement si escrow) et confiance transactionnelle. (Docs §13)

Scope:

* PSP integration setup (accounts, KYB/KYC si besoin)
* Escrow state machine
* Refund/dispute v0
* Fees + ledger
* Evidence pack minimal (proofs + hashes + logs)

Compliance notes:

* Phase 1 sans paiement intégré; Phase 2 via PSP agréé (escrow optionnel). (Docs §16)

Dependencies:

* Dépend de EP-3-HOF-01 (state machine transaction) + EP-0-POL-01 (approvals)

Risks:

* Compliance, chargebacks, fraude, PII

Mitigations:

* PSP + policies/approvals + audit + evidence packs

### Definition of Done

* Escrow flow end-to-end (hold→release/refund)
* Dispute v0 avec evidence pack
* Ledger minimal + fees calculées

---

## TI-210 — US-4-ESC-01 — PSP integration setup (accounts, KYB/KYC if needed)

**URL:** https://linear.app/ti-max/issue/TI-210/us-4-esc-01-psp-integration-setup-accounts-kybkyc-if-needed
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-210-us-4-esc-01-psp-integration-setup-accounts-kybkyc-if-needed`
**Parent:** TI-167 (Epic)

### User Story

En tant que plateforme, je veux intégrer un PSP pour proposer un escrow optionnel (paiement sécurisé) quand c'est nécessaire.

### Context

* Escrow optionnel via PSP agréé (Docs §5B, §16)

### Acceptance Criteria

* Given un PSP choisi
* When la config projet est faite
* Then on peut créer des comptes/charges nécessaires (sandbox) et récupérer les webhooks
* Given KYB/KYC requis
* When un seller onboard
* Then son statut est tracké et bloque l'escrow si non validé

### API/Schema impact

* Intégration PSP + stockage des ids externes + webhooks

### Telemetry (events)

* `psp.configured`
* `psp.webhook_received`

### Abuse/Security notes

* Secrets management + rotation; audit

### Definition of Done

* PSP sandbox opérationnel + webhooks reçus et vérifiés

---

## TI-211 — US-4-ESC-02 — Escrow state machine (hold → deliver → confirm → release)

**URL:** https://linear.app/ti-max/issue/TI-211/us-4-esc-02-escrow-state-machine-hold-→-deliver-→-confirm-→-release
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-211-us-4-esc-02-escrow-state-machine-hold-deliver-confirm`
**Parent:** TI-167 (Epic)

### User Story

En tant que système, je veux une state machine escrow stable (hold → deliver → confirm → release) avec sorties refund/dispute.

### Context

* Escrow phase 2 (Docs §5B)

### Acceptance Criteria

* Given une transaction escrow
* When le buyer paie
* Then état = HOLD
* When le seller marque DELIVERED (ou preuve)
* Then état = DELIVERED
* When le buyer confirme
* Then état = CONFIRMED puis RELEASE
* When un timeout arrive
* Then auto-transition (selon rules)

### API/Schema impact

* Modèle état escrow + transitions + idempotency

### Telemetry (events)

* `escrow.state_changed`

### Abuse/Security notes

* Transitions protégées par policies/approvals

### Definition of Done

* State machine implémentée + tests transitions

---

## TI-212 — US-4-ESC-03 — Refund/dispute v0

**URL:** https://linear.app/ti-max/issue/TI-212/us-4-esc-03-refunddispute-v0
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-212-us-4-esc-03-refunddispute-v0`
**Parent:** TI-167 (Epic)

### User Story

En tant qu'utilisateur, je veux ouvrir une dispute et demander un refund quand la transaction a un problème.

### Context

* Disputes v0 (Docs §5B, §16)

### Acceptance Criteria

* Given une transaction escrow
* When un participant ouvre une dispute
* Then état = DISPUTE_OPEN et evidence pack peut être attaché
* When une décision est prise
* Then refund ou release est exécuté via PSP et audité

### API/Schema impact

* Endpoints dispute/create/resolve

### Telemetry (events)

* `dispute.opened`
* `dispute.resolved`

### Abuse/Security notes

* Audit complet; rate limits sur disputes

### Definition of Done

* Dispute v0 end-to-end + intégration PSP

---

## TI-213 — US-4-ESC-04 — Escrow fee (3–5%) + ledger

**URL:** https://linear.app/ti-max/issue/TI-213/us-4-esc-04-escrow-fee-3-5percent-ledger
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-213-us-4-esc-04-escrow-fee-35-ledger`
**Parent:** TI-167 (Epic)

### User Story

En tant que plateforme, je veux calculer une fee escrow (3–5%) et tenir un ledger minimal.

### Context

* Modèle économique (Docs §13)

### Acceptance Criteria

* Given une transaction escrow
* When elle est released
* Then fee = % configurable est enregistrée
* And ledger enregistre: gross, fee, net, PSP ids

### API/Schema impact

* Ledger table + écritures atomiques

### Telemetry (events)

* `ledger.entry_created`

### Abuse/Security notes

* Éviter double-write via idempotency

### Definition of Done

* Fee calculée + ledger minimal + tests

---

## TI-214 — US-4-ESC-05 — Evidence pack minimal (proofs, hashes, logs)

**URL:** https://linear.app/ti-max/issue/TI-214/us-4-esc-05-evidence-pack-minimal-proofs-hashes-logs
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Channel/API, Phase/P4, Area/Billing, Type/Story
**Milestone:** Phase 4 — Escrow optionnel
**Git Branch:** `thannous/ti-214-us-4-esc-05-evidence-pack-minimal-proofs-hashes-logs`
**Parent:** TI-167 (Epic)

### User Story

En tant que système, je veux produire un evidence pack minimal (proofs + hashes + logs) pour disputes et audit.

### Context

* Evidence packs (Docs §5B, §16)
* Messages typés proof_request/proof_submit (Docs §7.3)

### Acceptance Criteria

* Given une dispute
* When un participant soumet une preuve
* Then la preuve est stockée et hashée, et liée à la transaction
* When un modérateur examine
* Then il voit la timeline + hashes + logs pertinents

### API/Schema impact

* Storage preuves + hashing + références dans audit log

### Telemetry (events)

* `evidence.submitted`

### Abuse/Security notes

* PII minimisation; accès restreint

### Definition of Done

* Evidence pack v0 stocké + consultable + hashé

---

## Résumé

| Ticket | Titre | Type | Status | Priority | Bloqué par |
|--------|-------|------|--------|----------|------------|
| TI-167 | EP-4-ESC-01 — Escrow optionnel via PSP | Epic | Backlog | High | TI-154, TI-156, TI-165 |
| TI-210 | US-4-ESC-01 — PSP integration setup | Story | Backlog | High | — |
| TI-211 | US-4-ESC-02 — Escrow state machine | Story | Backlog | High | — |
| TI-212 | US-4-ESC-03 — Refund/dispute v0 | Story | Backlog | High | — |
| TI-213 | US-4-ESC-04 — Escrow fee + ledger | Story | Backlog | High | — |
| TI-214 | US-4-ESC-05 — Evidence pack minimal | Story | Backlog | High | — |

## Dépendances inter-phases

```
Phase 0: TI-154 (Auth) ──────────┐
Phase 0: TI-156 (Policies) ──────┼──► TI-167 (Epic Escrow)
Phase 3: TI-165 (Contact Reveal) ┘         │
                                            ├── TI-210 (PSP setup)
                                            ├── TI-211 (State machine)
                                            ├── TI-212 (Dispute/refund)
                                            ├── TI-213 (Fees/ledger)
                                            └── TI-214 (Evidence pack)
```
