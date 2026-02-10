# Audit couverture tests — Telegram QoL (TI-296…TI-303)

Date: 2026-02-10  
Equipe Linear: Ti-Max  
Scope: tickets Telegram-first (pairing, menu, staged commands, approvals, notifications, attachments, webhook security, help)

## Notes importantes (hygiene de l'audit)

- Les IDs `TI-297…TI-303` existent aussi dans `docs/Clawdeals_V1_OpenClaw_DualConnect_LinearImportStyle.md` mais ce doc est une proposition distincte (collision d'identifiants). Cet audit se base sur les tickets Linear Telegram (Ti-Max / "Clawdeals V1 — Growth & Scale").
- Les specs historiques Telegram sont dans `docs/Clawdeals_V1_Tickets_QoL_TelegramFirst.md` mais avec des IDs differents (TI-225…TI-233). Mapping utile:
  - TI-296 ~= TI-225 (Pairing)
  - TI-297 ~= TI-226 (Menu + boutons)
  - TI-298 ~= TI-227 (Preview/Confirm/Undo)
  - TI-299 ~= TI-228 (Approvals)
  - TI-300 ~= TI-229 (Notif prefs + digest)
  - TI-301 ~= TI-232 (Attachments)
  - TI-302 ~= TI-233 (Webhook security)
- "Tests unitaires" dans cet audit inclut aussi des tests de handlers Next.js (Vitest) type `src/__tests__/pages-api/**` qui mockent Redis/Supabase: ce sont des tests "API unit/contract" (tres utiles) mais pas des tests d'integration E2E.
- Les tests Playwright "integration" reposent sur une DB Supabase migree. Les tests Telegram peuvent aussi dependre de secrets (`TELEGRAM_WEBHOOK_SECRET_TOKEN`, `INTERNAL_CRON_SECRET`, etc.).

## Resume global

- Tickets analyses: 8 (TI-296..TI-303)
- Couverture forte (unit + integration sur criteres cles): 1 (TI-299)
- Couverture partielle: 6 (TI-296, TI-297, TI-298, TI-300, TI-301, TI-302)
- Couverture manquante / ticket incomplet vs AC: 1 (TI-303)

### Gaps critiques (priorite)

1. Pas de spec Playwright dediee a la securite du webhook Telegram (TI-302) alors que c'est un risque P0.
2. Pas de suite Playwright de navigation Telegram (`/menu` + callbacks) (TI-297).
3. Staged commands (TI-298) testes en unit, mais pas verifies sur une vraie DB (integration).
4. Attachments (TI-301): 1 test integration "location" mais potentiellement skippable si schema non migre.
5. Help/Reset (TI-303): reset non implemente, exemples cliquables manquants.

## Tableau synthese: ticket -> couverture reelle

| Ticket | Impl dans le repo | Statut Linear (10/02/2026) | Tests integration (Playwright) | Tests unit/API (Vitest) | Verdict |
|---|---:|---|---|---|---|
| TI-302 Webhook security | Oui | Done | Aucun dedie | `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts` (22) | Manque integration "contract" |
| TI-296 Pairing | Oui | In Review | `e2e/integration/channels-telegram-pairing.spec.ts` (2) | `src/__tests__/pages-api/v1/channels/telegram-pairing.test.ts` (4) + webhook tests | Manque edge cases |
| TI-297 Menu + boutons | Partiel (stubs) | Backlog | Aucun | `src/server/channels/commands/execute.menu.test.ts` (2) + cards/parser/webhook | Manque integration nav + features |
| TI-298 Preview/Confirm/Undo | Core oui (API), pas wire TG | Backlog | Aucun | `src/__tests__/pages-api/v1/chat/commands.stage.test.ts` (3) + `src/__tests__/pages-api/v1/chat/commands.action.test.ts` (6) | Manque integration DB + TG wiring |
| TI-299 Approvals | Oui | Backlog | `e2e/integration/telegram-approvals.spec.ts` (4) | confirmations/cursor/webhook + approvals API tests | Bien couvre (a completer deny/roles) |
| TI-300 Notif prefs + digest | Oui | Backlog | `e2e/integration/notifications.spec.ts` (1) | prefs (3) + dispatch (4) + webhook | Manque integration TG prefs + digest multi-items |
| TI-301 Attachments | Partiel (location + photos) | Done | `e2e/integration/telegram-attachments.spec.ts` (1, skippable) | webhook tests (location + photos rejects/cleanup) | Manque integration photo + schema gate |
| TI-303 Help | Partiel (help), reset manquant | Backlog | Aucun | `src/server/channels/commands/parser.test.ts` couvre `help` | Ticket incomplet vs AC |

---

## Cartographie ticket -> tests (detail)

### TI-302 — Telegram webhook security + anti-replay

Critères cles (Linear): secret token header, (option) secret path, anti-replay (dedupe + TTL callbacks), blocage groupes, rate limiting, audit/telemetry.

Tests unit/API (Vitest)
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts`
  - secret token: `rejects missing or invalid secret token header`
  - secret path: `enforces secret path when TELEGRAM_WEBHOOK_PATH_SECRET is configured` + `enforces TELEGRAM_WEBHOOK_PATH_SECRET when configured (404 on missing/invalid)`
  - groupes: `blocks non-private chats (group spam guard)` (ignore 200)
  - anti-replay message: `dedupes replays (same message_id + chat_id)`
  - anti-replay callback: `dedupes callback query replays (same callback_query_id)`
  - TTL callbacks: `rejects too-old callback queries (TTL)`
  - rate limit group: `/start applies the channels.pair rate limit group`
  - disable prod: `returns 404 when channel commands are disabled in production`

Gaps / recommandations
- Ajouter un spec Playwright dedie `e2e/integration/telegram-webhook-security.spec.ts` pour figer le comportement "contract" (200 vs 401 vs 404, formats de reponse, replay indicator) contre le serveur complet.
- Ajouter un test (unit ou integration) "wrong secret token" distinct du cas "missing".
- Ajouter une verif de "telemetry/audit payload minimal" si c'est un DoD (actuellement: tests regardent `ctx.auditEvent` et certains `safeAuditLog`).

---

### TI-296 — Pairing wizard (Telegram-first)

Critères cles (Linear): web->TG via `/start <token>` (TTL, one-time), TG->web via `/connect` puis `pair:confirm`, policy "requires approval" vs auto-approve, unpaired write -> blocked.

Tests integration (Playwright)
- `e2e/integration/channels-telegram-pairing.spec.ts`
  - web -> TG `/start` cree identity PENDING + approval (policy par defaut)
  - TG `/connect` -> web confirm active identity quand policy auto-approve `channel.pair`

Tests unit/API (Vitest)
- `src/__tests__/pages-api/v1/channels/telegram-pairing.test.ts` (endpoints `pair:start` + `pair:confirm`)
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts`
  - `/connect` renvoie lien web + audit `channel.pair_started`
  - guidance quand non pair: `blocks when not allowlisted (suggests connect)`

Gaps / recommandations
- Edge cases manquants (ideaux en Playwright + DB):
  - token expire -> `PAIR_TOKEN_EXPIRED`
  - token reuse -> `PAIR_TOKEN_USED`
  - channel_user_id deja pair a un autre owner -> `CHANNEL_ALREADY_PAIRED`
  - revoke/unpair puis re-pair

---

### TI-297 — Menu + boutons (inline keyboard)

Critères cles (Linear): `/menu` renvoie une Home card avec 7 boutons, callbacks stables `cd:menu.*`, navigation par edit message, watchlists paginees.

Tests unit (Vitest)
- `src/server/channels/commands/execute.menu.test.ts`
  - Home card contient les actions attendues
  - Watchlists card expose pagination + create/back
- `src/server/channels/cards/telegram.test.ts`
  - encode/decode callback_data stable + size <= 64
  - rendu inline_keyboard (rows)
- `src/server/channels/commands/parser.test.ts`
  - parse `/menu` + callbacks `cd:menu.*`
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts`
  - `/menu returns the Home card with reply_markup` + callback_data stable (ex `cd:menu.watchlists:...`)

Gaps / recommandations
- Ajouter une spec Playwright `e2e/integration/telegram-menu-navigation.spec.ts`:
  - `/menu` -> Home card (7 boutons)
  - click watchlists -> editMessageText + pagination (Next/Back)
  - click approvals/notif/help -> editMessageText
- Attention: certaines destinations sont des stubs ("Coming soon", watchlists.create ouvre le web). Le test doit verifier la nav et la stabilite des callbacks, pas des features non implementees dans TG.

---

### TI-298 — Preview / Confirm / Undo (staged commands)

Critères cles (Linear): stage -> preview, confirm idempotent, cancel, undo fenetre 30s, policy -> pending approval.

Tests unit/API (Vitest)
- `src/__tests__/pages-api/v1/chat/commands.stage.test.ts` (stage + preview)
- `src/__tests__/pages-api/v1/chat/commands.action.test.ts` (confirm/cancel/undo + idempotency-key must equal command_id + pending approval mapping)
- `src/server/routes/route-groups.test.ts` (route groups `chat.commands.*`)

Gaps / recommandations
- Ajouter une spec Playwright `e2e/integration/chat-staged-commands.spec.ts` pour tester:
  - stage -> row `staged_commands` STAGED
  - confirm -> EXECUTED, idempotency, pas de double write
  - cancel -> CANCELLED
  - undo -> success/fail selon window
- Clarifier le lien avec Telegram: aujourd'hui, ce flow est API-first (pas encore declenche depuis `/menu` ou callbacks TG).

---

### TI-299 — Approvals in Telegram

Critères cles (Linear): `/approvals` liste PENDING (pagination), approve/deny idempotent, step-up pour actions HIGH (contact reveal), audit.

Tests integration (Playwright)
- `e2e/integration/telegram-approvals.spec.ts`
  - rendu + inline keyboard
  - pagination par callback (editMessageText)
  - double-approve stable ("Already resolved")
  - step-up `CONFIRM <code>` pour `contact_reveal` avant resolve

Tests unit/API (Vitest)
- `src/server/channels/command-confirmations.test.ts` (store/consume atomique)
- `src/server/channels/commands/approvals-cursor.test.ts` (cursor token compact)
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts` (approve + confirm flow via texte)
- Approvals API (dependance forte):
  - `src/__tests__/pages-api/v1/approvals/index.test.ts`
  - `src/__tests__/pages-api/v1/approvals/id.test.ts`

Gaps / recommandations
- Ajouter un test integration "deny" via callback.
- Ajouter un test roles: `viewer` ne peut pas approuver (ou erreur explicite).
- Si DoD: verifier l'effet de bord "message dans thread" apres approval (actuellement best-effort).

---

### TI-300 — Notification preferences + digest + quiet hours

Critères cles (Linear): settings via Telegram, modes (realtime/digest/silent), quiet hours + timezone, types toggles, digest batching/dedupe, quiet hours supprime realtime.

Tests integration (Playwright)
- `e2e/integration/notifications.spec.ts`
  - match watchlist -> outbox PENDING
  - cron dispatch (dry run) -> DELIVERED + timestamp

Tests unit/API (Vitest)
- `src/server/services/notification-preferences.test.ts` (defaults + validation)
- `src/server/services/notifications-dispatch.test.ts` (digest hourly + quiet hours skip)
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts`
  - `/notif` render + callback editMessageText
  - dedupe callback replay sur preferences
- `src/server/channels/telegram/keyboard.ts` (callback_data stables pour prefs)

Gaps / recommandations
- Ajouter une spec Playwright `e2e/integration/telegram-notifications-prefs.spec.ts`:
  - `/notif` -> keyboard + mode selection
  - callbacks mode/quiet/types -> DB `notification_preferences` mise a jour
- Ajouter un test de digest multi-items (3 deals -> 1 message) si c'est un DoD dur (aujourd'hui, on teste surtout "dispatch marks delivered").

---

### TI-301 — Attachments pipeline (Telegram photos + location)

Critères cles (Linear): location -> geo sur draft, photos -> download/validate/store/attach, limites (8 photos, 8MB), strip EXIF, rate limit.

Tests integration (Playwright)
- `e2e/integration/telegram-attachments.spec.ts`
  - location update cree/met a jour draft + persiste `active_listing_draft_id`
  - NOTE: test peut `skip` si `channel_identities.active_listing_draft_id` manque (schema drift)

Tests unit/API (Vitest)
- `src/__tests__/pages-api/v1/channels/telegram-webhook.test.ts`
  - location: `location update stores geo on the active draft`
  - photos (coverage "negative path" robuste):
    - reject si `TELEGRAM_BOT_TOKEN` manquant
    - short-circuit si max photos atteint (pas de download/upload)
    - cleanup storage si appendDraftListingPhoto echoue

Gaps / recommandations
- Photo happy-path en Playwright est difficile sans stub Telegram (le code fait de vrais fetch vers api.telegram.org).
  - Reco: ajouter un mode stub pour `src/server/channels/telegram/media.ts` en tests (ex env `TELEGRAM_MEDIA_MODE=stub`).
- Rendre le test location non-skippable via un "schema gate" CI (ou au moins documenter le prerequis migrations).

---

### TI-303 — Help that helps (exemples, suggestions, reset)

Critères cles (Linear): `/help` avec exemples cliquables + boutons Menu/Reset, reset annule wizard state (draft/staged) sans supprimer les entites, toute erreur renvoie Menu button.

Etat actuel (impl)
- `help` existe (texte) et `menu_help` existe (card "Help" + bouton Retour).
- Pas de `reset` (parser/execute) et pas d'exemples "cliquables" via reply_markup.

Tests existants
- `src/server/channels/commands/parser.test.ts` (parse `help`)

Gaps / recommandations
- Implementer `reset` + un help "cardifie" (exemples + boutons) puis ajouter:
  - spec Playwright `e2e/integration/telegram-help-reset.spec.ts`
  - tests unit pour `parseCommand("reset")` et execute reset (annule draft + staged commands)

---

## Batterie de tests proposee (alignement avec l'impl actuelle)

Priorite 1 (securite / DoD)
- `e2e/integration/telegram-webhook-security.spec.ts` (TI-302)
- `e2e/integration/telegram-menu-navigation.spec.ts` (TI-297)

Priorite 2 (robustesse / regressions)
- `e2e/integration/telegram-pairing-edge-cases.spec.ts` (TI-296)
- `e2e/integration/chat-staged-commands.spec.ts` (TI-298)

Priorite 3 (feature coverage)
- `e2e/integration/telegram-notifications-prefs.spec.ts` (TI-300)
- `e2e/integration/telegram-attachments-location.spec.ts` (TI-301) (ou renforcer l'existant)

Priorite 4 (quand TI-303 est implemente)
- `e2e/integration/telegram-help-reset.spec.ts` (TI-303)

