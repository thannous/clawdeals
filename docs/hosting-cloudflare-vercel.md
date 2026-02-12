# Hosting: Landing Cloudflare, App Vercel

Objectif: garder la landing SEO sur Cloudflare (`clawdeals.com`) et mettre la partie applicative sur Vercel (`app.clawdeals.com`).

Ce repo reste une seule app Next.js (Pages Router). La separation se fait via:
- DNS (2 hosts).
- Variables d'environnement (marketing vs app).
- `middleware.ts` (redirects par host + canonisation).

## Environment Topology (Production-Safe)

Use a 3-environment model and keep all automated tests away from production data.

- Production Supabase project ref: `gztfmpuqtpvncdcuhqxy`
- Staging Supabase project: create and operate it in org `vercel_icfg_xONouQQU8hcFdkKBpX1Ebbzi` (`Thanh's projects`)
- Vercel model: same Vercel project (`clawdeals`) with a dedicated `staging` Git branch for a stable staging deployment
- Domains:
  - Production app: `https://app.clawdeals.com`
  - Staging app: `https://staging.app.clawdeals.com`
- Remote test policy: integration/smoke/E2E tests must target staging only, never production

Branch/deployment mapping:
- `feature/*` -> Vercel preview deployments
- `staging` -> stable staging deployment (`staging.app.clawdeals.com`)
- `main` -> production deployment (`app.clawdeals.com`)

## Cible des domaines

- Marketing (Cloudflare Workers / OpenNext): `https://clawdeals.com` (+ `https://www.clawdeals.com` qui redirige vers l'apex).
- App (Vercel): `https://app.clawdeals.com`

Routage attendu:
- `clawdeals.com/` sert la landing.
- `www.clawdeals.com/*` redirige vers `clawdeals.com/*` (308).
- `clawdeals.com/deals*` et `clawdeals.com/console*` redirigent vers `app.clawdeals.com` (308).
- `app.clawdeals.com/` redirige vers `/deals` (308).
- `*.vercel.app/*` redirige vers `clawdeals.com` ou `app` (308) pour eviter du contenu non-canonique.

## Setup Vercel (app.clawdeals.com)

1. Vercel > Project `clawdeals` > Domains: ajouter `app.clawdeals.com`.
2. Cloudflare DNS: creer un record `CNAME` `app` vers la cible indiquee par Vercel (souvent `cname.vercel-dns.com`).
3. Re-deployer (ou attendre la verification).

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

Si la landing (sur `www`) doit appeler l'API sur `app` (ex: waitlist):
- `CORS_ALLOW_ORIGINS=https://www.clawdeals.com,https://clawdeals.com`
- `NEXT_PUBLIC_API_BASE_URL=https://app.clawdeals.com` (cote Cloudflare, voir plus bas)

Optionnel (SSE hors Vercel):
- `NEXT_PUBLIC_SSE_BASE_URL=https://<host-sse>` (cote Vercel)

### Vercel Preview/Staging (`staging` branch)

- `APP_HOST=staging.app.clawdeals.com`
- `MARKETING_HOSTS=clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://staging.app.clawdeals.com`
- `APP_ENTRY_PATH=/start`
- `SUPABASE_URL=<SUPABASE_URL_STAGING>`
- `SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY_STAGING>`
- `NEXT_PUBLIC_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL_STAGING>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING>`
- `NEXT_PUBLIC_API_BASE_URL=https://staging.app.clawdeals.com`

Important:
- Never set production Supabase credentials in Vercel Preview environment.
- Preview/staging deployments must be isolated from production DB and production secrets.

### Cloudflare (Marketing)

- `NEXT_PUBLIC_APP_URL=https://app.clawdeals.com` (utilise pour les liens vers l'app)
- `NEXT_PUBLIC_APP_ENTRY_PATH=/start` (CTA "Get API key" -> onboarding dev; sinon `/deals` ou `/console`)
- `NEXT_PUBLIC_API_BASE_URL=https://app.clawdeals.com` (uniquement si tu veux que la waitlist poste vers l'API Vercel)
- `SITE_URL=https://clawdeals.com` (utilise pour canonical/robots/sitemap)

Also document a staging marketing setup (if enabled later):
- `NEXT_PUBLIC_API_BASE_URL=https://staging.app.clawdeals.com`
- Keep this value in non-production-only contexts.

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

## Related Runbooks

- Canonical environment policy: `docs/release-environments.md`
- Manual promotion procedure: `docs/release-staging-to-prod.md`
