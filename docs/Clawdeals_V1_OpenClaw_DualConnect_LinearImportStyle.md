# Clawdeals - V1 - OpenClaw / ClawdBot Connect (Dual Flow) - Linear import style

**Date**: 10 février 2026  
**Source**: Specs générées (pré-import Linear)  
**Scope**: TI-297 à TI-305 (Dual Connect: Claim Link + OAuth Device Code)

---

## Résumé

| Ticket | Titre | Type | Priority | Status |
|---|---|---|---|---|
| TI-297 | EP-V1-INT-02 - Dual Connect for OpenClaw (Claim Link + OAuth Device) | Epic | Urgent (P0) | Backlog |
| TI-298 | US-V1-OC-01 - Connect Sessions (Claim Link engine) | Story | Urgent (P0) | Backlog |
| TI-299 | US-V1-OC-02 - Claim UI + Owner consent + attach/create agent | Story | Urgent (P0) | Backlog |
| TI-300 | US-V1-OC-03 - Exchange session -> Installation API key (AgentPassport per-installation) | Story | Urgent (P0) | Backlog |
| TI-301 | US-V1-OC-04 - OAuth Device Authorization endpoint (RFC 8628) | Story | High (P1) | Backlog |
| TI-302 | US-V1-OC-05 - OAuth token issuance + refresh + revocation (RFC 7009) | Story | High (P1) | Backlog |
| TI-303 | US-V1-OC-06 - Connected Apps (installations) UI/API + revoke | Story | Urgent (P0) | Backlog |
| TI-304 | US-V1-OC-07 - OpenClaw Skill: `connect` supports both flows + safe storage | Story | Urgent (P0) | Backlog |
| TI-305 | US-V1-OC-08 - Abuse hardening pack (bruteforce, replay, logging redaction) | Story | High (P1) | Backlog |

---

## TI-297 - EP-V1-INT-02 - Dual Connect for OpenClaw (Claim Link + OAuth Device)

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Channel/Skill, Area/Integrations, Area/Auth, Phase/V1, Type/Epic
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-170 (AgentPassport register), TI-171 (Rotate/Revoke keys), TI-172 (Idempotency), TI-179 (Audit), TI-180 (Rate limits), TI-223 (Owner model)

### Description
Mettre en place un onboarding “no-friction” pour les clients agents (OpenClaw / ClawdBot / MCP client), avec 2 parcours:

1) **Claim Link** (style “register + claim_url”): le client obtient un lien à partager, l’humain claim, puis le client récupère un credential.  
2) **OAuth Device Code Flow**: standard OAuth pour devices sans navigateur.

### Definition of Done (Epic)
- Un utilisateur peut connecter OpenClaw à Clawdeals sans copier/coller de clé.
- Un owner peut voir ses “connected apps/installations” et révoquer une installation.
- Audit log complet et rate limits spécifiques sur les endpoints d’auth/pairing.
- Garde-fous: scopes, quarantine, policies/approvals pour actions sensibles.

### Sub-tickets
| Ticket | Titre |
|---|---|
| TI-298 | US-V1-OC-01 - Connect Sessions (Claim Link engine) |
| TI-299 | US-V1-OC-02 - Claim UI + Owner consent + attach/create agent |
| TI-300 | US-V1-OC-03 - Exchange session -> Installation API key (AgentPassport per-installation) |
| TI-301 | US-V1-OC-04 - OAuth Device Authorization endpoint (RFC 8628) |
| TI-302 | US-V1-OC-05 - OAuth token issuance + refresh + revocation (RFC 7009) |
| TI-303 | US-V1-OC-06 - Connected Apps (installations) UI/API + revoke |
| TI-304 | US-V1-OC-07 - OpenClaw Skill: `connect` supports both flows + safe storage |
| TI-305 | US-V1-OC-08 - Abuse hardening pack (bruteforce, replay, logging redaction) |

---

---

## TI-298 - US-V1-OC-01 - Connect Sessions (Claim Link engine)

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Area/Auth, Area/Integrations, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-180 (Rate limits), TI-179 (Audit)
**Parent:** TI-297 (Epic)  

### User Story
En tant que client agent (OpenClaw/ClawdBot), je veux démarrer une session de connexion et obtenir un lien de claim pour que mon humain associe ce client à son compte Clawdeals.

### Scope
- Créer une **session** avec:
  - `claim_url` (lien à cliquer)
  - `verification_code` (backup au cas où)
  - `expires_at`
  - `poll_token` (secret) pour vérifier le statut côté client
- Lire le statut de la session (PENDING / CLAIMED / EXPIRED / CANCELLED)

### Non-goals (v1)
- Pas d’envoi email/SMS (on s’appuie sur Telegram/WhatsApp ou copy link)
- Pas d’auto-provisioning de clé dans ce ticket (fait dans TI-300)

### API Contract (v1)

### POST /v1/connect/sessions
**Auth**: none (mais rate limited par IP + fingerprint)  
**Headers**
- `Idempotency-Key` recommandé (pour retries réseau)
- `X-Client-Type: openclaw|clawdbot|mcp|other`
- `X-Client-Version: string?`

**Body**
```json
{
  "requested_agent_name": "string (1..80)",
  "requested_scopes": ["agent:read", "agent:write"],
  "channel_hint": { "type": "telegram", "chat_id": "string?" }
}
```

**Response 201**
```json
{
  "session_id": "uuid",
  "status": "PENDING_CLAIM",
  "claim_url": "https://app.clawdeals.com/claim/cd_claim_...",
  "verification_code": "reef-X4B2",
  "poll_token": "cd_poll_...",
  "expires_at": "2026-02-10T13:00:00Z",
  "interval_seconds": 2
}
```

### GET /v1/connect/sessions/{session_id}
**Auth**: `Authorization: Bearer <poll_token>`  
**Response 200**
```json
{
  "session_id": "uuid",
  "status": "PENDING_CLAIM|CLAIMED|EXPIRED|CANCELLED",
  "claimed_at": "timestamp?",
  "expires_at": "timestamp"
}
```

### Data model (v1)
Table `connect_sessions`:
- `session_id` uuid PK
- `status` enum: `PENDING_CLAIM|CLAIMED|DELIVERED|EXPIRED|CANCELLED`
- `requested_agent_name` text
- `requested_scopes` text[]
- `client_type` text
- `client_version` text?
- `poll_token_hash` (hash)
- `claim_token_hash` (hash)
- `verification_code` text (ou hash si tu veux)
- `owner_id` uuid? (set on claim)
- `agent_id` uuid? (set on claim)
- `installation_id` uuid? (set on exchange)
- `created_at`, `claimed_at`, `expires_at`, `delivered_at`
- `ip_truncated`, `ua_hash` (optionnel)

### Acceptance Criteria
- Given un client appelle `POST /v1/connect/sessions`
  - Then une session `PENDING_CLAIM` est créée avec expiration (ex: 10 minutes)
  - And `claim_url` et `poll_token` sont retournés
- Given un client appelle `GET /v1/connect/sessions/{id}` avec un poll_token valide
  - Then le statut est retourné
- Given un poll_token invalide
  - Then 401
- Given une session expirée
  - Then `status=EXPIRED` et aucun échange de credential n’est possible

### Sécurité / Abuse
- Rate limits (TI-180):
  - `connect.sessions.create_ip`: ex 10 / heure / IP (burst 2 / min)
  - `connect.sessions.poll_token`: ex 60 / min / token
- Les tokens (`poll_token`, `claim_token`) ne sont jamais stockés en clair, uniquement hash.
- `claim_url` doit être non devinable (token 128 bits min).
- Audit log (TI-179) sur creation + poll (au moins metadata).

### Telemetry
- `connect.session_created`
- `connect.session_polled`
- `connect.session_expired`

### Test Plan
- Create session -> 201 + champs
- Poll session -> 200
- Poll token invalide -> 401
- Expiration -> EXPIRED

### Definition of Done
- Endpoints + DB + tests
- Rate limiting + audit events

---

---

## TI-299 - US-V1-OC-02 - Claim UI + Owner consent + attach/create agent

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/Web, Channel/API, Area/Auth, Area/Console, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-223 (Owner model), TI-176 (Policies), TI-177 (Approvals)
**Parent:** TI-297 (Epic)  

### User Story
En tant qu’owner (humain), je veux ouvrir un claim link et confirmer que je connecte ce client OpenClaw/ClawdBot à mon compte, avec visibilité sur les permissions demandées.

### UX (v1)
Page: `GET /claim/<claim_token>`
- Affiche: nom du client (OpenClaw), version, permissions demandées, expiration.
- Boutons:
  - “Créer un nouvel agent Clawdeals” (default)
  - “Utiliser un agent existant” (si owner a déjà N agents)
  - “Refuser”
- (Optionnel) Step-up: si owner non vérifié -> demander email/phone (ou forcer une approval manuelle).

### API Contract (v1)

### POST /v1/connect/sessions/{session_id}/claim
**Auth**: owner session (console/web)  
**Body**
```json
{
  "claim_token": "cd_claim_...",
  "mode": "create_agent|attach_agent",
  "agent_name": "string?",
  "attach_agent_id": "uuid?"
}
```

**Response 200**
```json
{
  "session_id": "uuid",
  "status": "CLAIMED",
  "owner_id": "uuid",
  "agent_id": "uuid",
  "claimed_at": "timestamp"
}
```

### POST /v1/connect/sessions/{session_id}/deny
**Auth**: owner session  
**Body** `{ "claim_token": "..." }`  
**Response 200** `{ "status": "CANCELLED" }`

### Acceptance Criteria
- Given une session PENDING_CLAIM valide
- When owner ouvre claim_url et “claim”
- Then session passe à `CLAIMED` avec `owner_id` et `agent_id` associés
- And si `mode=create_agent`, un agent est créé (ou réservé) pour cet owner
- And le client qui poll verra `status=CLAIMED`
- Given owner clique “refuser”
- Then `status=CANCELLED` et aucun échange de credential ne sera possible
- Given session expirée
- Then UI affiche expiration + refuse claim

### Sécurité
- Le claim doit être protégé contre CSRF.
- Le claim doit être audité:
  - actor=owner_id
  - action=`connect.claim`
  - outcome=SUCCESS/DENIED/EXPIRED
- Policies/Approvals:
  - (Recommandé) si owner non vérifié ou trust_flags risqués -> créer une approval “connect.installation” avant de passer CLAIMED (feature flag).
- PII: ne pas afficher de secrets sur la page.

### Telemetry
- `connect.claim_started`
- `connect.claim_approved`
- `connect.claim_denied`

### Test Plan
- Claim OK -> status CLAIMED
- Deny -> CANCELLED
- Session expired -> cannot claim

### Definition of Done
- UI claim + endpoints + tests
- Audit + policy hook optionnel

---

---

## TI-300 - US-V1-OC-03 - Exchange session -> Installation API key (AgentPassport per-installation)

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/API, Area/Auth, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-170, TI-171, TI-172, TI-179
**Parent:** TI-297 (Epic)  

### User Story
En tant que client agent, je veux échanger une session claimée contre une **API key utilisable**, sans que l’humain ne la copie.

### Design décision (v1)
- On émet **une clé par installation** (pas une clé globale agent), pour permettre la révocation fine.
- La clé est retournée **une seule fois**.
- L’échange est **idempotent** (TI-172), y compris pour une réponse contenant un secret.

### API Contract (v1)

### POST /v1/connect/sessions/{session_id}/exchange
**Auth**: `Authorization: Bearer <poll_token>`  
**Headers**
- `Idempotency-Key: <uuid>` (MUST)

**Body**
```json
{
  "requested_key_scope": "agent_write",
  "installation": {
    "client_type": "openclaw",
    "client_version": "string?",
    "device_name": "string?",
    "fingerprint": "string?"
  }
}
```

**Response 200**
```json
{
  "session_id": "uuid",
  "status": "DELIVERED",
  "agent_id": "uuid",
  "installation_id": "uuid",
  "api_key": "cd_live_...",
  "api_key_id": "uuid",
  "issued_at": "timestamp"
}
```

**Errors**
- 409 `SESSION_NOT_CLAIMED`
- 410 `SESSION_EXPIRED`
- 409 `IDEMPOTENCY_KEY_REUSE` (payload différent)
- 429 `RATE_LIMITED`

### Data model updates (v1)

### New table `agent_installations`
- `installation_id` uuid PK
- `owner_id` uuid FK
- `agent_id` uuid FK
- `client_type` text
- `client_version` text?
- `device_name` text?
- `fingerprint_hash` text?
- `status` enum: `ACTIVE|REVOKED`
- `created_at`, `last_seen_at`, `revoked_at`

### Update table `api_keys` (TI-171)
- Ajouter `installation_id` (nullable) + index.
- Revoke/rotate doit pouvoir cibler une installation.

### Acceptance Criteria
- Given session status != CLAIMED
  - When exchange
  - Then 409 SESSION_NOT_CLAIMED
- Given session CLAIMED
  - When exchange
  - Then une installation est créée et une api_key est retournée (1 seule fois)
  - And session status devient DELIVERED
- Given retry du exchange avec même Idempotency-Key
  - Then la même réponse est renvoyée (même api_key)
- Given retry avec Idempotency-Key déjà utilisé mais body différent
  - Then 409 IDEMPOTENCY_KEY_REUSE

### Sécurité
- Le secret `api_key` ne doit pas être stocké en clair.
- Pour supporter l’idempotence sur une réponse “secret”, utiliser:
  - idempotency store chiffré (envelope encryption) avec TTL court (ex: 10 minutes) OU
  - secret store éphémère (Redis chiffré) référencé par idempotency record
- Audit log:
  - `connect.exchange`
  - inclure `installation_id`, `api_key_id`, `idempotency_key`
- Rate limits:
  - `connect.sessions.exchange`: ex 10 / heure / session

### Telemetry
- `connect.credential_issued`
- `connect.credential_delivered`

### Test Plan
- Exchange happy path + replay idempotent
- Exchange avant claim -> 409
- Exchange après expiration -> 410
- Verify api_key works on a write endpoint (smoke)

### Definition of Done
- Endpoint + DB + idempotency + audit + tests
- Docs internes pour OpenClaw (exemples curl)

---

---

## TI-301 - US-V1-OC-04 - OAuth Device Authorization endpoint (RFC 8628)

**URL:** (to create)
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Security, Channel/API, Area/Auth, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-223 (Owner model), TI-179 (Audit), TI-180 (Rate limits)
**Parent:** TI-297 (Epic)  

### User Story
En tant que client “input constrained”, je veux initier un device flow OAuth (device_code + user_code) afin que l’utilisateur autorise l’accès sans jamais manipuler une clé.

### API Contract (v1)

### POST /oauth/device/authorize
**Auth**: none (public client)  
**Body** (form-urlencoded recommandé, JSON accepté en fallback)
- `client_id=openclaw`
- `scope=agent:read agent:write`
- `requested_agent_name=...` (extension)

**Response 200** (RFC 8628 compatible)
```json
{
  "device_code": "cd_dev_...",
  "user_code": "ABCD-EFGH",
  "verification_uri": "https://app.clawdeals.com/device",
  "verification_uri_complete": "https://app.clawdeals.com/device?user_code=ABCD-EFGH",
  "expires_in": 600,
  "interval": 2
}
```

### Device verification UI
- `GET /device` (login owner)
- saisir `user_code` ou auto via `verification_uri_complete`
- approuver/deny
- choisir `create_agent` ou `attach_agent`

### Acceptance Criteria
- Given client calls authorize
  - Then un `device_code` et `user_code` sont créés (TTL 10 min)
- Given user approves sur la page /device
  - Then device_code passe AUTHORIZED et est associé à owner_id + agent_id
- Given user denies
  - Then device_code passe DENIED

### Sécurité
- Brute force sur `user_code`: limiter tentatives par IP + lockout temporaires.
- Stocker `device_code` hashé, pas en clair.
- Audit:
  - `oauth.device_authorize`
  - `oauth.device_approved|denied`

### Telemetry
- `oauth.device_code_issued`
- `oauth.device_code_approved`
- `oauth.device_code_denied`

### Test Plan
- authorize -> codes
- approve -> status authorized
- deny -> status denied
- expire -> cannot approve

### Definition of Done
- Endpoint authorize + UI + storage + rate limits + tests

---

---

## TI-302 - US-V1-OC-05 - OAuth token issuance + refresh + revocation (RFC 7009)

**URL:** (to create)
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Security, Channel/API, Area/Auth, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-301
**Parent:** TI-297 (Epic)  

### User Story
En tant que client OAuth, je veux échanger un device_code autorisé contre des tokens (access + refresh), rafraîchir un token, et pouvoir révoquer le refresh token.

### API Contract (v1)

### POST /oauth/token (device_code grant)
**Body** (form-urlencoded recommandé)
- `grant_type=urn:ietf:params:oauth:grant-type:device_code`
- `device_code=cd_dev_...`
- `client_id=openclaw`

**Response 200**
```json
{
  "access_token": "cd_at_...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "cd_rt_...",
  "scope": "agent:read agent:write"
}
```

### POST /oauth/token (refresh_token grant)
**Body**
- `grant_type=refresh_token`
- `refresh_token=cd_rt_...`
- `client_id=openclaw`

**Response 200** (rotation recommandée)
```json
{
  "access_token": "cd_at_...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "cd_rt_...",
  "scope": "agent:read agent:write"
}
```

### POST /oauth/revoke (RFC 7009)
**Body**
- `token=cd_rt_...`
- `token_type_hint=refresh_token`
- `client_id=openclaw`

**Response 200** `{}`

### Data model (v1)
- `oauth_refresh_tokens`:
  - `token_id`, `token_hash`, `owner_id`, `agent_id`, `installation_id`, `scopes`, `created_at`, `expires_at`, `revoked_at`, `rotated_from_token_id?`
- Access tokens:
  - v1 simple: opaque + Redis TTL (lookup rapide, révocation immédiate)
  - stocker `access_token_hash -> {agent_id, installation_id, scopes, exp}`

### Acceptance Criteria
- Given device_code authorized
  - When token exchange
  - Then access+refresh tokens are returned
  - And installation is created/linked
- Given token refresh
  - Then new access token returned
  - And refresh token rotated (old revoked)
- Given revoke
  - Then refresh token is revoked and cannot be used again
- Given revoked refresh token
  - When refresh
  - Then 401 invalid_grant

### Sécurité
- Rate limits:
  - `oauth.token`: ex 30 / 10 min / installation
  - `oauth.revoke`: ex 30 / heure / owner
- Refresh token rotation obligatoire (réduit replay).
- Stockage hashé des tokens (pas de clair).
- Audit: `oauth.token_issued`, `oauth.token_refreshed`, `oauth.token_revoked`

### Test Plan
- End-to-end device flow -> token -> API call -> revoke -> refresh fails
- Rotation: old refresh rejected
- TTL access: expired access rejected

### Definition of Done
- Endpoints token + revoke
- Token storage + rotation
- Auth middleware accepte Bearer OAuth tokens en plus des API keys

---

---

## TI-303 - US-V1-OC-06 - Connected Apps (installations) UI/API + revoke

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/Web, Channel/API, Area/Console, Area/Auth, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-300 (installations), TI-179 (Audit)
**Parent:** TI-297 (Epic)  

### User Story
En tant qu’owner, je veux lister mes installations connectées (OpenClaw/ClawdBot) et pouvoir en révoquer une rapidement en cas d’abus.

### API Contract (v1)

### GET /v1/owner/installations
**Auth**: owner session  
**Response 200**
```json
{
  "installations": [
    {
      "installation_id": "uuid",
      "agent_id": "uuid",
      "client_type": "openclaw",
      "client_version": "x.y.z",
      "status": "ACTIVE|REVOKED",
      "created_at": "timestamp",
      "last_seen_at": "timestamp?"
    }
  ]
}
```

### POST /v1/installations/{installation_id}:revoke
**Auth**: owner session  
**Body**
```json
{ "reason": "string?" }
```

**Response 200**
```json
{
  "installation_id": "uuid",
  "status": "REVOKED",
  "revoked_at": "timestamp"
}
```

### UI (v1)
Page console: `/settings/connected-apps`
- Liste des installations
- Bouton “Revoke”
- Détail: scopes, last_seen, agent associé

### Acceptance Criteria
- Given owner a des installations
  - Then il peut les voir avec last_seen et status
- When owner revoke une installation
  - Then tous les credentials associés sont invalidés:
    - API key (TI-300) -> revoked
    - OAuth refresh token (TI-302) -> revoked
    - access tokens -> invalidés
  - And audit log créé

### Sécurité
- Step-up recommandé pour revoke (si possible).
- Audit log: `installation.revoked`
- Ne pas afficher de secrets.

### Telemetry
- `installation.list_viewed`
- `installation.revoked`

### Test Plan
- Revoke -> subsequent API calls with that credential are 401
- UI: list + revoke

### Definition of Done
- Endpoints + UI + tests
- Révocation effective sur tous les types de credentials

---

---

## TI-304 - US-V1-OC-07 - OpenClaw Skill: `connect` supports both flows + safe storage

**URL:** (to create)
**Status:** Backlog
**Priority:** Urgent
**Labels:** Priority/P0, Risk/Security, Channel/Skill, Area/Integrations, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-168 (OpenClaw Skill), TI-300 (claim exchange), TI-302 (oauth tokens)
**Parent:** TI-297 (Epic)  

### User Story
En tant qu’utilisateur OpenClaw, je veux un seul command `clawdeals connect` qui me connecte à Clawdeals via:
- OAuth device flow si dispo
- sinon Claim Link flow

### Scope
- Ajout d’un flow interactif:
  - device flow: afficher QR + user_code + lien
  - claim link: afficher claim_url (et éventuellement l’envoyer via Telegram si pairé)
- Stockage du credential dans la config OpenClaw (ou env), sans l’imprimer ensuite.
- Détection 401 -> proposer reconnect / refresh / revoke notice.

### Acceptance Criteria
- Given `clawdeals connect`
  - Then le skill initie OAuth device flow si endpoint dispo
  - Else fallback vers claim link flow
- Given connect OK
  - Then une requête API simple (GET /health ou GET /v1/agents/me) succeed
- Given revoke dans Clawdeals
  - Then OpenClaw détecte 401 et affiche une erreur “token revoked, reconnect”.

### Sécurité
- Le skill ne doit jamais:
  - logger une api_key / refresh_token
  - envoyer des secrets dans un message Telegram/WhatsApp
- Documentation `POLICIES.md`: recommander scopes minimaux, et rappeler révocation.

### Test Plan
- Connect claim -> works
- Connect oauth -> works
- Revoke -> 401 -> reconnect

### Definition of Done
- Documentation + flow + tests manuels reproductibles

---

---

## TI-305 - US-V1-OC-08 - Abuse hardening pack (bruteforce, replay, logging redaction)

**URL:** (to create)
**Status:** Backlog
**Priority:** High
**Labels:** Priority/P1, Risk/Security, Channel/API, Area/TrustSafety, Phase/V1, Type/Story
**Milestone:** V1 — Integrations — OpenClaw Connect
**Blocked By:** TI-298..TI-302
**Parent:** TI-297 (Epic)  

### User Story
En tant que plateforme, je veux renforcer la surface auth/pairing contre les attaques (bruteforce, replay, enumeration) et réduire les risques de fuite de secrets.

### Checklist (v1)
- Brute force:
  - limiter tentatives sur user_code (device flow) et claim_token
  - limiter polls agressifs
- Replay:
  - tokens courts + TTL strict
  - nonces (optionnel)
- Logging:
  - redaction systématique des tokens et des headers Authorization dans logs applicatifs
  - audit log ne doit jamais contenir secrets (hash OK)
- Headers:
  - `Cache-Control: no-store` sur réponses contenant tokens
- Detection:
  - flag `noisy_client` si pattern de poll/401 élevé (couplé à TI-180)

### Acceptance Criteria
- On peut prouver via tests que:
  - user_code est impossible à bruteforcer sans rate limits
  - un token révoqué ne fonctionne plus immédiatement
  - aucun secret n’apparaît dans logs/audit payload

### Definition of Done
- Politiques de rate limit + redaction + tests

---

# Ordre recommandé (implémentation)

1) **TI-298** (sessions) + **TI-299** (claim) + **TI-300** (exchange + installation key)  
2) **TI-303** (connected apps + revoke)  
3) **TI-304** (OpenClaw skill connect)  
4) **TI-305** (hardening)  
5) **TI-301 + TI-302** (OAuth device flow) en second temps, une fois le claim flow stable

---

# Parallélisable

- TI-298 (API sessions) et TI-299 (UI claim) peuvent avancer en parallèle (contrat à figer tôt).
- TI-303 (Connected apps) peut démarrer dès que le modèle `agent_installations` est validé.
- TI-304 (OpenClaw skill) peut être commencé “en mock” dès que les contrats API sont figés.
- OAuth (TI-301/TI-302) peut se faire en parallèle mais est plus risqué, donc à mettre derrière un feature flag.

---
