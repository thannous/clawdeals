# Hosting: Landing Cloudflare, App Vercel

Objectif: garder la landing SEO sur Cloudflare (`www.clawdeals.com`) et mettre la partie applicative sur Vercel (`app.clawdeals.com`).

Ce repo reste une seule app Next.js (Pages Router). La separation se fait via:
- DNS (2 hosts).
- Variables d'environnement (marketing vs app).
- `middleware.ts` (redirects par host + canonisation).

## Cible des domaines

- Marketing (Cloudflare Workers / OpenNext): `https://www.clawdeals.com` (+ `https://clawdeals.com` qui redirige vers `www` si tu le souhaites cote Cloudflare).
- App (Vercel): `https://app.clawdeals.com`

Routage attendu:
- `www.clawdeals.com/` sert la landing.
- `www.clawdeals.com/deals*` et `www.clawdeals.com/console*` redirigent vers `app.clawdeals.com` (308).
- `app.clawdeals.com/` redirige vers `/deals` (308).
- `*.vercel.app/*` redirige vers `www` ou `app` (308) pour eviter du contenu non-canonique.

## Setup Vercel (app.clawdeals.com)

1. Vercel > Project `clawdeals` > Domains: ajouter `app.clawdeals.com`.
2. Cloudflare DNS: creer un record `CNAME` `app` vers la cible indiquee par Vercel (souvent `cname.vercel-dns.com`).
3. Re-deployer (ou attendre la verification).

Note SSE: si tu utilises le live feed (`/console/live-feed`) en production, evite de mettre Cloudflare "proxied" devant `app` tant que tu n'as pas verifie le comportement des connexions longues.

## Variables d'environnement

### Vercel (App)

- `APP_HOST=app.clawdeals.com`
- `MARKETING_HOSTS=clawdeals.com,www.clawdeals.com`
- `NEXT_PUBLIC_APP_URL=https://app.clawdeals.com`
- `APP_ENTRY_PATH=/start` (recommended pour self-serve dev; sinon `/deals` ou `/console`)

Si la landing (sur `www`) doit appeler l'API sur `app` (ex: waitlist):
- `CORS_ALLOW_ORIGINS=https://www.clawdeals.com,https://clawdeals.com`
- `NEXT_PUBLIC_API_BASE_URL=https://app.clawdeals.com` (cote Cloudflare, voir plus bas)

Optionnel (SSE hors Vercel):
- `NEXT_PUBLIC_SSE_BASE_URL=https://<host-sse>` (cote Vercel)

### Cloudflare (Marketing)

- `NEXT_PUBLIC_APP_URL=https://app.clawdeals.com` (utilise pour les liens vers l'app)
- `NEXT_PUBLIC_APP_ENTRY_PATH=/start` (CTA "Get API key" -> onboarding dev; sinon `/deals` ou `/console`)
- `NEXT_PUBLIC_API_BASE_URL=https://app.clawdeals.com` (uniquement si tu veux que la waitlist poste vers l'API Vercel)
- `SITE_URL=https://www.clawdeals.com` (utilise pour canonical/robots/sitemap)

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

La landing (`www.*`) reste la source canonique (SSR + cache edge).

## Verifications rapides

1. Ouvrir `https://www.clawdeals.com/` puis cliquer les CTA: tu dois arriver sur `https://app.clawdeals.com/deals`.
2. `https://www.clawdeals.com/deals` doit rediriger vers `https://app.clawdeals.com/deals`.
3. `https://app.clawdeals.com/robots.txt` doit etre un `Disallow`.
4. Waitlist: soumettre un email sur `www` et verifier le POST vers l'API attendue (meme origin ou `app`).
