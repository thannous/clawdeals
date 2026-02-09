# Clawdeals - V1 QoL Multi-canal (Telegram-first) - Tickets Linear (proposition)

**Date:** 09 février 2026 (Europe/Paris)  
**Objectif:** livrer une UX chat "sans friction" en commençant par **Telegram** (le plus simple à shipper vite), tout en gardant une architecture multi-canal extensible (WhatsApp/Discord ensuite).

> IDs proposés: **TI-224 à TI-234** (réutilise la numérotation déjà partagée). Adaptez si votre séquence Linear a déjà avancé.

---

## Pourquoi Telegram d'abord (rappel produit)

Telegram permet de:
- faire du **pairing par deep-link** (`t.me/<bot>?start=<token>`) et donc un onboarding quasi "1 tap" côté mobile,
- utiliser des **inline keyboards** (boutons) pour supprimer 80% du texte à taper,
- itérer vite sans la couche "templates approval" propre à WhatsApp.

WhatsApp et Discord restent au programme, mais plutôt en **V1.1** (polish) après validation du parcours TG.

---

## EPIC V1.0 (Telegram-first)

## TI-224 - EP-V1-TGCHAT-01 - Telegram QoL Pack (Pairing, Menu, Preview/Confirm, Approvals, Notifs, Help)

**Type:** Epic  
**Status:** Backlog  
**Priority:** High  
**Labels (suggested):** Priority/P1, Risk/Security, Phase/V1, Channel/Telegram, Area/Integrations, Type/Epic  
**Depends on (hard):**
- TI-223 (Owner model + verification)
- TI-172 (Idempotency keys)
- TI-176 (Policy engine)
- TI-177 (Approvals queue)
- TI-179 (Audit log)
- TI-180 (Rate limits)

**Depends on (soft / recommended):**
- TI-169 + TI-221 + TI-222 (MCP + command set + pairing/allowlists) si vous voulez mutualiser la couche "assistant multi-canal".
- TI-161/TI-191 (SSE) si vous poussez des alertes temps réel dès V1.0.

### Goal
Permettre à un owner de piloter Clawdeals **depuis Telegram**:
- connecter son compte (pairing),
- créer/consulter watchlists,
- recevoir des matches,
- faire une offer et négocier,
- gérer les approvals,
- configurer les notifications,
sans toucher à une API key, ni voir du JSON.

### Scope V1.0 (Telegram)
- US-QOL-01 Pairing wizard (Telegram + web confirm + deep link)
- US-QOL-02 Menu + boutons (inline keyboards)
- US-QOL-03 Preview + Confirm + Undo
- US-QOL-04 Approvals in chat (cards + buttons)
- US-QOL-05 Notification preferences + digest + quiet hours
- US-QOL-07 Attachments pipeline (photos + location, Telegram d'abord)
- US-QOL-08 Help that helps

### Non-goals V1.0
- WhatsApp template pack / Flows (reportés V1.1)
- Discord slash commands (reportés V1.1)
- Automatiser des actions "dangereuses" sans preview/confirm ou approval

### Definition of Done (Epic)
- Un owner peut faire le parcours complet depuis Telegram:
  1) Pairing
  2) Créer une watchlist
  3) Recevoir un match
  4) Créer une offer (avec preview/confirm)
  5) Résoudre une approval (si policy)
- Tous les write passent par: idempotency + audit + rate limit
- Aucun contenu sensible (PII, clés) ne fuit dans le chat ni dans l'audit payload

### Sub-tickets
| Ticket | Titre |
|---|---|
| TI-225 | US-QOL-01 - Pairing wizard (Telegram-first) |
| TI-226 | US-QOL-02 - Menu + boutons Telegram (inline keyboard) |
| TI-227 | US-QOL-03 - Preview + Confirm + Undo |
| TI-228 | US-QOL-04 - Approvals in Telegram |
| TI-229 | US-QOL-05 - Notification prefs + digest + quiet hours (Telegram-first) |
| TI-232 | US-QOL-07 - Attachments pipeline (Telegram photos + location) |
| TI-233 | US-QOL-SEC - Telegram webhook security + anti-replay |
| TI-234 | US-QOL-08 - Help that helps (TG) |

---

## TI-225 - US-QOL-01 - Pairing wizard (Telegram-first)

**Type:** Story  
**Status:** Backlog  
**Priority:** Urgent  
**Labels:** Priority/P0, Risk/Security, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story  
**Blocked by:** TI-223, TI-180, TI-179

### User Story
En tant qu'utilisateur (owner), je veux connecter Telegram à mon compte Clawdeals en < 30 secondes, sans API key, pour piloter mon agent facilement.

### Design (recommandé)
Supporter **2 entrées** (les deux sont utiles, car le monde réel est désordonné):

1) **Depuis le web (recommandé pour la majorité)**
- "Connect Telegram" dans la console Clawdeals
- redirection vers `https://t.me/<bot>?start=<pair_token>`
- le bot reçoit `/start <pair_token>` et associe le compte

2) **Depuis Telegram**
- user écrit `/connect`
- le bot renvoie un lien web `https://app.clawdeals.com/pair?token=...`
- sur le web, l'user confirme l'association

### Acceptance Criteria
- Given je suis connecté sur le web Clawdeals
- When je clique "Connect Telegram"
- Then Clawdeals génère un `pair_token` (TTL 10 min, one-time)
- And redirige vers le deep-link Telegram avec le token
- When j'appuie sur "Start" dans Telegram
- Then le bot reçoit `/start <pair_token>`
- And l'association est créée: `channel_accounts(state=PAIRED)`

- Given je suis dans Telegram
- When je tape `/connect`
- Then je reçois un bouton "Associer mon compte" vers la page web
- When je confirme sur le web
- Then le channel passe `PAIRED` et je reçois une confirmation dans Telegram

- Given une policy "pairing requires approval" (default possible)
- When un pairing est demandé
- Then `channel_accounts.state=PENDING_APPROVAL`
- And une `approval` est créée
- And toute commande write renvoie 403 `CHANNEL_NOT_PAIRED` (avec guidance)

### API / Data model (proposition)
- Table `channel_accounts`
  - `channel_account_id (uuid)`
  - `owner_id (uuid)` (FK)
  - `channel_type = telegram`
  - `channel_user_id` (string) + `channel_user_id_hash` (recommandé)
  - `state = PENDING_APPROVAL|PAIRED|REVOKED`
  - `paired_at`, `revoked_at`, `last_seen_at`
  - `metadata` (jsonb) ex: `{chat_id, username, is_group}`

- Table `pairing_tokens`
  - `pair_token` (string random)
  - `owner_id`
  - `expires_at`
  - `consumed_at`
  - `attempts_count`

- Endpoints
  - `POST /v1/channels/telegram/pair:start` (auth owner) -> `{pair_token, expires_at, telegram_deeplink}`
  - `POST /v1/channels/telegram/pair:confirm` (auth owner) body `{pair_token}`
  - `POST /v1/channels/{channel_account_id}:revoke`
  - `GET /v1/channels`

### Security / Abuse notes
- Token: TTL court, one-time, rate limit start/confirm
- Dédoublonnage: 1 `channel_user_id` ne peut être lié qu'à 1 owner (sauf procédure ops)
- Audit: ne jamais stocker `channel_user_id` en clair dans payload (hash/redaction)

### Telemetry
- `channel.pair_started`
- `channel.pair_confirmed`
- `channel.pair_rejected`
- `channel.revoked`

### Test Plan
- happy path web -> TG
- happy path TG -> web
- token expiré -> 400 `PAIR_TOKEN_EXPIRED`
- token consommé -> 409 `PAIR_TOKEN_USED`
- unpaired write -> 403

### Definition of Done
- Pairing E2E + tests
- Default safe (PENDING_APPROVAL supporté)
- UX claire en mobile

---

## TI-226 - US-QOL-02 - Menu + boutons Telegram (inline keyboard)

**Type:** Story  
**Status:** Backlog  
**Priority:** High  
**Labels:** Priority/P0, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story  
**Blocked by:** TI-225 (pairing), TI-180 (rate limits)

### User Story
En tant qu'utilisateur Telegram, je veux un menu et des boutons pour naviguer sans apprendre de commandes.

### Acceptance Criteria
- When je tape `/menu` (ou "menu")
- Then je reçois une "Home card" avec inline keyboard:
  - Watchlists
  - Matches / alertes
  - Publier une annonce
  - Mes threads / négociations
  - Approvals
  - Notifications
  - Help

- When je clique "Watchlists"
- Then je vois:
  - liste paginée (max 5-10 items)
  - bouton "Créer une watchlist"
  - bouton "Retour"

- Chaque click de bouton:
  - ne dépend pas du texte (pas fragile)
  - déclenche un `command_id` stable côté serveur
  - est idempotent quand il provoque un write (via TI-227)

### Implementation Notes
- Introduire un format interne "Card JSON" (agnostique canal):
  - `title`, `subtitle`, `bullets[]`, `actions[]`, `entity_ref`
- Renderer Telegram:
  - map Card -> `sendMessage/editMessageText` + inline keyboard callbacks
- Pagination:
  - callbacks `next_page` / `prev_page` (stateless si possible)
- Support "edit message" (éviter spam du chat)

### Security
- Toutes les actions vérifient:
  - `channel_account.state == PAIRED`
  - ownership (owner_id)
  - allowlist/denylist si activé (policies)
  - rate limit par route-group (chat.menu, chat.nav, chat.search)

### Telemetry
- `chat.menu_opened`
- `chat.action_clicked` (action_name)
- `chat.card_rendered`

### Definition of Done
- Menu utilisable 100% au pouce sur mobile
- Navigation stable + logs

---

## TI-227 - US-QOL-03 - Preview + Confirm + Undo

**Type:** Story  
**Status:** Backlog  
**Priority:** Urgent  
**Labels:** Priority/P0, Risk/Security, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story  
**Blocked by:** TI-172, TI-176, TI-177

### User Story
En tant qu'utilisateur, je veux voir un résumé clair avant une action write, confirmer en 1 tap, et annuler rapidement si je me suis trompé.

### Scope (minimum V1.0)
- create watchlist
- create listing
- create offer / counter offer
- request contact reveal
- mark completed

### Acceptance Criteria
- Given une intention ou un bouton qui implique un write
- When le bot a tous les champs nécessaires
- Then il envoie une Preview card:
  - action + entity (listing/thread/watchlist)
  - montants, devise, expiration
  - impacts policy (ex: "policy max_offer=400")
  - risque ("contact reveal = sensible")
  - boutons: [Confirmer] [Modifier] [Annuler]

- When je clique "Confirmer"
- Then l'action est exécutée avec:
  - `Idempotency-Key = command_id`
  - audit log (SUCCESS / FAILURE / BLOCKED)
  - réponse "Success" + next steps

- If policy exige approval:
  - Then `approval` est créée
  - And la preview devient "PENDING_APPROVAL"
  - And l'action n'est pas exécutée tant que non approuvée

- Undo:
  - actions compensables: offer.cancel, listing.removed, watchlist.deactivate
  - fenêtre `UNDO_WINDOW_SECONDS=30` (config)
  - un bouton "Undo" apparaît
  - après expiration, afficher "Undo expiré"

### API / Schema (proposition)
- Table `staged_commands`
  - `command_id (uuid)`
  - `owner_id`, `channel_account_id`
  - `action_type` (enum)
  - `payload` (jsonb) (redacted si sensible)
  - `state=STAGED|CONFIRMED|EXECUTED|CANCELLED|EXPIRED`
  - `created_at`, `expires_at`
  - `result_ref` (entity_id)

- Endpoints (internes ou publics)
  - `POST /v1/chat/commands:stage`
  - `POST /v1/chat/commands/{command_id}:confirm`
  - `POST /v1/chat/commands/{command_id}:cancel`
  - `POST /v1/chat/commands/{command_id}:undo` (si supporté)

### Security / Abuse
- Stage/confirm rate-limited
- Ne jamais stocker de secret en clair dans payload (ex: api_key)
- Logging: command_id OK, payload redacted obligatoire

### Telemetry
- `chat.command_staged`
- `chat.command_confirmed`
- `chat.command_executed`
- `chat.command_cancelled`
- `chat.command_undone`

### Definition of Done
- Preview/confirm actif sur toutes les actions listées
- Idempotence testée
- Undo opérationnel sur 2 actions minimum (offer.cancel + watchlist.deactivate)

---

## TI-228 - US-QOL-04 - Approvals in Telegram (cards + buttons)

**Type:** Story  
**Status:** Backlog  
**Priority:** Urgent  
**Labels:** Priority/P0, Risk/Security, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story  
**Blocked by:** TI-177, TI-226

### User Story
En tant qu'owner, je veux approuver/refuser une action directement dans Telegram.

### Acceptance Criteria
- Commandes:
  - `/approvals` -> liste des approvals PENDING (paginée)
  - boutons "Approve" / "Deny" sur chaque item

- Chaque Approval card inclut:
  - action (ex: "Offer 450 EUR")
  - raison du blocage (ex: "policy max_offer=400")
  - contexte (listing + thread)
  - niveau de risque (LOW/MED/HIGH)
  - boutons Approve/Deny

- When Approve
  - Then approval passe APPROVED
  - And l'action est exécutée (idempotent)
  - And le thread concerné reçoit une notification typée (info)
- When Deny
  - Then approval passe DENIED
  - And le thread reçoit une notification typée (warning/info)

### Step-up (recommandé v1)
- Pour actions HIGH (ex: contact reveal):
  - exiger une confirmation supplémentaire "Tape CONFIRM" OU code court
  - (option) limiter à certains channels (only Telegram DM, pas groupe)

### Security
- vérifier owner_id
- audit log complet: qui a approuvé, depuis quel channel_account_id

### Telemetry
- `chat.approvals_listed`
- `chat.approval_approved`
- `chat.approval_denied`

### Definition of Done
- Approvals E2E depuis Telegram, avec step-up pour contact reveal
- Tests double-approve / pagination

---

## TI-229 - US-QOL-05 - Notification preferences + digest + quiet hours (Telegram-first)

**Type:** Story  
**Status:** Backlog  
**Priority:** High  
**Labels:** Priority/P1, Phase/V1, Channel/Telegram, Area/Notifications, Type/Story  
**Blocked by (soft):** TI-190 (watchlist matching), TI-161/TI-191 (SSE) si temps réel

### User Story
En tant qu'utilisateur, je veux contrôler la fréquence des notifications (temps réel vs digest), et activer des heures calmes.

### Acceptance Criteria
- Paramètres accessibles via Telegram (menu):
  - mode: `REALTIME | DIGEST_DAILY | DIGEST_HOURLY | SILENT`
  - quiet hours (ex: 22:00-08:00, timezone owner)
  - types: watchlist_match, offer_received, approval_required, transaction_updates
  - seuil "matches forts" (ex: `price <= X` OU `trust_score >= Y`)

- Digest:
  - regroupe et dédupe (N max items)
  - format compact: 1 ligne par item + bouton "Voir"
  - envoyé à heure fixe (daily) ou chaque heure (hourly)

- When quiet hours
  - Then pas d'envoi realtime
  - And digest envoyé au prochain créneau autorisé

### Data model (proposition)
- Table `notification_preferences`
  - `owner_id`, `channel_type=telegram`
  - `mode`, `quiet_hours`, `event_types[]`
  - `filters` (jsonb)
  - `updated_at`

### Security / Abuse
- rate limit sur update prefs
- ne jamais pousser PII dans notifs (contacts, phone/email)
- journaliser `notifications.skipped` (raison)

### Telemetry
- `notifications.preference_updated`
- `notifications.sent`
- `notifications.skipped` (quiet_hours / disabled / missing_channel / rate_limited)

### Definition of Done
- Paramètres + digest job opérationnels
- 1 type d'event minimum: `watchlist.match`

---

## TI-232 - US-QOL-07 - Attachments pipeline (Telegram photos + location)

**Type:** Story  
**Status:** Backlog  
**Priority:** High  
**Labels:** Priority/P1, Risk/Security, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story  
**Blocked by:** Listings (TI-193) + Storage (Supabase/S3)

### User Story
En tant qu'utilisateur Telegram, je veux envoyer des photos et ma localisation dans le chat pour publier une annonce plus vite.

### Acceptance Criteria
- Photos:
  - When j'envoie 1..N photos au bot
  - Then le bot télécharge le fichier (API Telegram), valide type/size, stocke en object storage
  - And attache les photos à un `listing_draft_id`
  - And renvoie une preview: titre (si connu), nb photos, statut "draft"

- Localisation:
  - When j'envoie un message location
  - Then `geo(lat,lon)` est stocké sur le draft (ou listing)
  - And la recherche par distance fonctionne ensuite

- Limits v1 (config):
  - `MAX_PHOTOS_PER_LISTING = 8`
  - `MAX_PHOTO_MB = 8`
  - rate limit upload par owner

### Security / Abuse notes
- strip EXIF (recommandé) pour éviter fuite de géoloc dans les photos
- antivirus/scan simple si possible, sinon "quarantine media" (flag) + ops review
- pas de lien externe cliquable ajouté automatiquement

### Telemetry
- `media.uploaded`
- `media.rejected` (reason)
- `location.received`

### Definition of Done
- Photos + location E2E sur Telegram
- Draft listing utilisable avec TI-227 preview/confirm

---

## TI-233 - US-QOL-SEC - Telegram webhook security + anti-replay

**Type:** Story  
**Status:** Backlog  
**Priority:** Urgent  
**Labels:** Priority/P0, Risk/Security, Phase/V1, Channel/Telegram, Area/Security, Type/Story  
**Blocked by:** Setup Telegram bot webhook

### User Story
En tant que plateforme, je veux vérifier que chaque requête entrante Telegram est authentique, non rejouée, et correctement attribuée.

### Acceptance Criteria
- Webhook auth:
  - utiliser un webhook URL "secret" (path random) ET/OU un `secret_token` (header)
  - rejeter si token absent / invalide

- Attribution:
  - chaque update est mappé vers `channel_account_id` via `chat_id`/`user_id`
  - si inconnu: state = UNPAIRED, pas de write, proposer `/connect`

- Anti-replay:
  - rejeter callbacks trop anciens (timestamp + TTL)
  - stocker `callback_query.id` (ou message_id + chat_id) en Redis TTL court pour dédupe
  - logs/audit sur rejets

- Rate limiting:
  - limiter `/start`, callbacks, messages free-text
  - protéger contre spam de groupes

### Telemetry
- `webhook.verified`
- `webhook.rejected` (reason)
- `webhook.replay_detected`

### Definition of Done
- Webhook TG durci + tests (signature-like via secret_token, replay, rate limit)

---

## TI-234 - US-QOL-08 - Help that helps (exemples, suggestions, reset)

**Type:** Story  
**Status:** Backlog  
**Priority:** Medium  
**Labels:** Priority/P2, Phase/V1, Channel/Telegram, Area/Integrations, Type/Story

### User Story
En tant qu'utilisateur, je veux une aide utile (exemples + boutons) et un moyen de repartir de zéro si je me perds.

### Acceptance Criteria
- `/help` renvoie:
  - 6 exemples cliquables (watchlist, offer, approvals, listing, notifications, sécurité)
  - bouton "Menu"
  - bouton "Reset"

- "Reset":
  - annule l'état de wizard en cours (draft listing, commande staged)
  - ne supprime pas les données produit existantes (listings, watchlists, offers)
  - confirme dans le chat: "OK, reset effectué"

- Erreurs:
  - toute erreur renvoie: cause courte + action suivante + bouton "Menu"

### Telemetry
- `chat.help_opened`
- `chat.reset_used`
- `chat.example_clicked`

### Definition of Done
- Help + reset disponibles et testés

---

## EPIC V1.1 (après Telegram)

### TI-239 - EP-V1-WA-01 - WhatsApp productionization pack (templates, window, flows)

**Type:** Epic (optionnel dans ce fichier)  
**Priority:** Medium  
**Labels:** Phase/V1.1, Channel/WhatsApp, Risk/Compliance, Area/Integrations

Objectif: rendre la même UX possible sur WhatsApp malgré:
- règles de fenêtre de conversation,
- templates approuvés,
- contraintes d'interactive UI.

Sub-tickets (déjà définis dans votre pack):
- TI-230 - US-QOL-06 - WhatsApp template pack minimal
- TI-231 - WhatsApp Flows (forms)
- (option) extension TI-232 pour "location request" WhatsApp

---

## Ordre recommandé (Telegram-first)

1) **TI-233** (sécurité webhook TG) + skeleton bot + rate limits de base  
2) **TI-225** (pairing E2E)  
3) **TI-226** (/menu + navigation)  
4) **TI-227** (preview/confirm + staging)  
5) **TI-228** (approvals in chat)  
6) **TI-229** (prefs + digest)  
7) **TI-232** (photos + location)  
8) **TI-234** (help + reset)

---

## Parallélisable (pratique)

- TI-233 peut démarrer en parallèle de TI-225 (même équipe intégrations)  
- TI-226 (UI/menu) peut être fait en parallèle de TI-227 (staging)  
- TI-229 (prefs + digest) peut être fait en parallèle de TI-228 (approvals)  
- TI-232 (media pipeline) peut avancer en parallèle, dès que Storage + Listing draft existent
