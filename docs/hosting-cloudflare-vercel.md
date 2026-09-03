# Hosting: Landing Cloudflare, App Vercel

Objectif: garder la landing SEO sur Cloudflare (`clawdeals.com`) et mettre la partie applicative sur Vercel (`app.clawdeals.com`).

Ce repo reste une seule app Next.js (Pages Router). La separation se fait via:
- DNS (2 hosts).
- Variables d'environnement (marketing vs app).
- `workers/edge-router.ts` (routing/redirects au niveau Cloudflare).
- `middleware.ts` (canonisation et garde-fous cote Vercel).

## Environment Topology (Production-Safe)

Use a 3-environment model and keep all automated tests away from production data.

- Production Supabase project ref: `gztfmpuqtpvncdcuhqxy`
- Staging Supabase project: separate European project with synthetic data only
- Vercel model: separate `clawdeals-staging` project connected to this repository, so staging credentials cannot leak into production previews
- Domains:
  - Production app: `https://app.clawdeals.com`
  - Staging app: `https://staging.app.clawdeals.com`
- Remote test policy: integration/smoke/E2E tests must target staging only, never production

Deployment mapping:
- Vercel project `clawdeals` -> production (`app.clawdeals.com`)
- Vercel project `clawdeals-staging` -> isolated staging (`staging.app.clawdeals.com`)
- Repository work remains on `main`; staging isolation is provided by distinct service projects and credentials

## Cible des domaines

- Marketing (Cloudflare Edge Router + upstream Vercel): `https://clawdeals.com` (+ `https://www.clawdeals.com` qui redirige vers l'apex).
- App (Vercel): `https://app.clawdeals.com`

Routage attendu:
- `www.clawdeals.com/*` redirige vers `clawdeals.com/*` (308).
- `clawdeals.com/deals*`, `clawdeals.com/console*`, `clawdeals.com/auth*`, `clawdeals.com/start*`, `clawdeals.com/settings*`, `clawdeals.com/developer*` redirigent vers `app.clawdeals.com` (308).
- `clawdeals.com/api/*` est proxifie vers `app.clawdeals.com/api/*` (pas de redirect, pour conserver les flows browser same-origin), sauf le chemin exact `/api/mcp` traite par le Worker et desactive par defaut.
- Le reste de `clawdeals.com/*` est proxifie vers `MARKETING_ORIGIN`.
- `app.clawdeals.com/` redirige vers l'entree app (`APP_ENTRY_PATH`, par defaut `/start`).
- `*.vercel.app/*` redirige vers `clawdeals.com` ou `app` (308) pour eviter du contenu non-canonique.

## Setup Vercel (app.clawdeals.com)

1. Vercel > Project `clawdeals` > Domains: ajouter `app.clawdeals.com`.
2. Cloudflare DNS: creer un record `CNAME` `app` vers la cible indiquee par Vercel (souvent `cname.vercel-dns.com`).
3. Re-deployer (ou attendre la verification).
4. Conserver `regions: ["dub1"]` dans `vercel.json`; c'est le réglage durable des Functions, colocalisé avec le Supabase de production en Irlande (`eu-west-1`).

Note SSE: si tu utilises le live feed (`/console/live-feed`) en production, evite de mettre Cloudflare "proxied" devant `app` tant que tu n'as pas verifie le comportement des connexions longues.

## Variables d'environnement

### Vercel Production (`main`)

- `APP_HOST=app.clawdeals.com`
- `MARKETING_HOSTS=clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://app.clawdeals.com`
- `APP_ENTRY_PATH=/start` (recommended pour self-serve dev; sinon `/deals` ou `/console`)
- `SUPABASE_URL=<SUPABASE_URL_PROD>`
- `SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY_PROD>`
- `NEXT_PUBLIC_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL_PROD>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD>`
- `UPSTASH_REDIS_REST_URL=<UPSTASH_REDIS_REST_URL_PROD>`
- `UPSTASH_REDIS_REST_TOKEN=<UPSTASH_REDIS_REST_TOKEN_PROD>`
- `CRON_SECRET=<CRON_SECRET_PROD>`

Si la landing (sur `www`) doit appeler l'API sur `app` (ex: waitlist):
- `CORS_ALLOW_ORIGINS=https://www.clawdeals.com,https://clawdeals.com`
- `NEXT_PUBLIC_API_BASE_URL=https://app.clawdeals.com` (cote Cloudflare, voir plus bas)

Optionnel (SSE hors Vercel):
- `NEXT_PUBLIC_SSE_BASE_URL=https://<host-sse>` (cote Vercel)

### Vercel Staging (`clawdeals-staging` project)

- `APP_HOST=staging.app.clawdeals.com`
- `MARKETING_HOSTS=clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://staging.app.clawdeals.com`
- `APP_ENTRY_PATH=/start`
- `SUPABASE_URL=<SUPABASE_URL_STAGING>`
- `SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY_STAGING>`
- `NEXT_PUBLIC_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL_STAGING>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING>`
- `NEXT_PUBLIC_API_BASE_URL=https://staging.app.clawdeals.com`
- `UPSTASH_REDIS_REST_URL=<UPSTASH_REDIS_REST_URL_STAGING>`
- `UPSTASH_REDIS_REST_TOKEN=<UPSTASH_REDIS_REST_TOKEN_STAGING>`
- `CRON_SECRET=<CRON_SECRET_STAGING>`

Important:
- Never set production Supabase credentials in Vercel Preview environment.
- Preview/staging deployments must be isolated from production DB and production secrets.

### Cloudflare (Edge Router)

- `MARKETING_HOST=clawdeals.com` (host marketing canonique)
- `APP_ORIGIN=https://app.clawdeals.com` (origin applicatif)
- `MARKETING_ORIGIN=https://clawdeals.vercel.app` (origin upstream de la landing; ne doit jamais pointer vers `clawdeals.com`)
- `REMOTE_MCP_ENABLED=false` (kill switch production; ne pas activer sans les gates du plan 90 jours)

Staging equivalent:
- `APP_ORIGIN=https://staging.app.clawdeals.com`
- `MARKETING_ORIGIN=https://<staging-marketing-origin>`

## CORS (API)

Le CORS n'est pas ouvert globalement. Il est applique uniquement sur quelques endpoints appeles cross-origin:
- `/api/v1/watchlist-signups`
- `/api/v1/events/stream`
- `/api/console/events/stream`

Si tu dois exposer d'autres endpoints au navigateur cross-origin, il faut etendre la liste dans `src/server/middleware/with-api-middlewares.ts`.

## SEO

L'app (`app.*`) n'est pas une surface SEO:
- `robots.txt` y renvoie `Disallow: /`.
- `sitemap.xml` renvoie 404.

La landing (`clawdeals.com`) reste la source canonique (SSR + cache edge).

## Verifications rapides

1. Ouvrir `https://clawdeals.com/` puis cliquer les CTA: tu dois arriver sur `https://app.clawdeals.com/deals`.
2. `https://clawdeals.com/deals` doit rediriger vers `https://app.clawdeals.com/deals`.
3. `https://app.clawdeals.com/robots.txt` doit etre un `Disallow`.
4. Waitlist: soumettre un email sur l'apex et verifier le POST vers l'API attendue (meme origin ou `app`).
5. Chunks JS apres un deploiement: `npm run verify:static-chunks -- --base https://clawdeals.com --repeat 5 --interval-ms 30000`
   doit terminer sur `PASS` (tous les `/_next/static/*` references par `/`, `/webmcp-challenge`, `/browse`, `/marketplace` repondent 200).

### Chunks immuables: 503 `cf-speculation-refused` (TI-495)

Constat du 03/09/2026: dans un navigateur, une ou deux requetes de chunks
`/_next/static/immutable/chunks/*.js` par page repondent 503 via `clawdeals.com`, de facon
**deterministe** (toujours les memes chunks), alors que `curl` obtient 200.

Cause racine (verifiee le 03/09 a 23:30): ces requetes sont des **prefetch** du navigateur
(`Sec-Purpose: prefetch`, declenches par Next.js pour les routes liees). La zone a **Speed Brain**
actif (`speculation-rules: "/cdn-cgi/speculation"`, `tag: cf-speed-brain`) et Cloudflare refuse
tout prefetch sur une route servie par un Worker: reponse `503`, corps vide, en-tete
`cf-speculation-refused: prefetch refused: disabled for worker requests`, sans jamais atteindre
le Worker ni l'origine. La page s'hydrate normalement (les chunks necessaires ne sont pas des
prefetch); l'effet visible est une erreur console par prefetch refuse. Ce n'est ni un decalage
HTML <-> chunks (le HTML est servi `DYNAMIC`) ni une erreur transitoire de Vercel.

Correctif: desactiver **Speed Brain** sur la zone `clawdeals.com` (Dashboard > Speed >
Optimization > Content Optimization > Speed Brain: Off), puis verifier que
`curl -sI -H 'Sec-Purpose: prefetch' https://clawdeals.com/_next/static/immutable/chunks/<x>.js`
repond 200 et que l'en-tete `speculation-rules` a disparu de `/`. `npm run verify:static-chunks`
inclut cette sonde (`prefetch_probe`) et avertit tant que le refus est actif.

Mitigation complementaire dans `workers/edge-router.ts` (conservee, utile pour les vraies
erreurs d'origine pendant une bascule de deploiement):

- les requetes `GET /_next/static/*` proxifiees sont rejouees jusqu'a 2 fois (150 ms puis 400 ms)
  quand l'origine repond 5xx ou echoue reseau; les autres chemins ne sont pas rejoues;
- chaque tentative est journalisee (`proxy.static_retry`, `proxy.static_fetch_error`) avec le chemin
  et le statut, sans corps de reponse;
- `scripts/verify-static-chunks.mjs` sert de smoke post-deploiement (voir ci-dessus) et peut tourner
  en boucle pendant la fenetre de bascule.

Si des 503 **sans** `cf-speculation-refused` apparaissent malgre les retries, purger le cache
Cloudflare de la zone apres le deploiement Vercel (Dashboard > Caching > Purge Everything, ou API
`purge_cache`) et rouvrir TI-495.

## Deploy commands

- Cloudflare edge router (production): `npm run deploy:cloudflare`
- Cloudflare edge router (local preview): `npm run preview:cloudflare`
- Legacy OpenNext path (fallback only): `npm run deploy:cloudflare:opennext`

## Related Runbooks

- Canonical environment policy: `docs/release-environments.md`
- Manual promotion procedure: `docs/release-staging-to-prod.md`
- Edge router deploy details: `docs/deploy-edge-router.md`
- EU launch and market contract: `docs/launch-eu-fr-gb-es.md`
