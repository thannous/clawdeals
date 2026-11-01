# Public structured data

Audited 2026-11-01. Scope: the 18 indexable routes in
`src/content/seo-routes.ts`, each in EN/FR/ES (54 URLs). This is a source/local
validation report; this change is not deployed.

## Findings and corrections

| Finding | Correction |
| --- | --- |
| Home, Trust Engine, Policy Control, Audit Trail, MCP and OpenClaw emitted JSON-LD only after hydration | All use the shared, SSR-rendered `src/ui/seo/JsonLd.tsx`; preserve escaping of `<` to prevent script termination. A new HTTP/browser regression reproduced the missing homepage graph before the fix. |
| Home declared `https://github.com/clawdeals` as an identity; it returns 404 | Remove the unverified `sameAs`; do not substitute a repository or personal account for the organization. Use the existing 192px PNG logo. |
| Home and three feature pages used `en-US`, unlike the site's `en-GB` hreflang | Align the English language; the single WebSite entity declares all three supported languages. |
| Most FR/ES breadcrumbs led back to the English homepage | Use the localized home URL; translate the Spanish MCP safety guide breadcrumb. |
| Three SoftwareApplication nodes had no published offer/review | Remove them from home/OpenClaw; describe the MCP presentation as WebPage. Public pricing explicitly has no final price list. Do not invent free offers or reviews. |
| Procedural editorial guides exposed only HowTo; MCP safety reused the same identity for its page and article | Add Article alongside the existing HowTo, with headline, real dates, image and editorial author; add explicit WebPage/mainEntity relationships and separate the MCP safety Article ID. Retain existing TechArticle. |
| Publisher organizations had inconsistent identities; homepage FAQ fragment had no target | Reference the homepage Organization ID from editorial publishers; add the visible FAQ anchor and language. |

## Page contract and eligibility

- Home: Organization, WebSite, WebPage and its existing FAQPage.
- Features, MCP, OpenClaw and pricing: WebPage and BreadcrumbList (OpenClaw also
  retains its actual ImageObject).
- Browse, deals, guides and integrations hubs: CollectionPage and BreadcrumbList;
  guides/integrations retain their content-backed ItemList.
- Guides: Article (also HowTo for procedural guides) or TechArticle, WebPage,
  BreadcrumbList, and their existing visible FAQPage.
- Editorial standards: AboutPage, editorial Organization and BreadcrumbList.
- Listing/deal details, comparison and legal pages currently declare `noindex`.
  No Product/Offer markup or indexing change is added to these surfaces.
  TrustScore is an agent trust signal, not a product rating.

Google eligibility is not the same as Schema.org vocabulary validity:

- [Supported search features](https://developers.google.com/search/docs/appearance/structured-data/search-gallery),
  [Article](https://developers.google.com/search/docs/appearance/structured-data/article),
  [Breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb),
  [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)
  and [site names](https://developers.google.com/search/docs/appearance/site-names)
  support the choices above; valid markup does not guarantee a search appearance.
- [Software app results](https://developers.google.com/search/docs/appearance/structured-data/software-app)
  require an offer price and a rating/review. Reintroduce only when matching
  verifiable content is published.
- [FAQ rich results were retired in May 2026](https://developers.google.com/search/updates)
  and [HowTo rich results in 2023](https://developers.google.com/search/blog/2023/08/howto-faq-changes).
  Existing FAQ/step descriptions remain for semantic consumers of the published
  content; this PR does not claim those retired Google appearances or add new
  FAQ/HowTo features. No SearchAction is added for the retired sitelinks search box.

## Reproduce local validation

Use the repository's Node 24.22.1+ (below 25) and an already installed compatible
Chromium. No account, model, database fixture, Redis service or production opt-in
is needed. Explicit loopback placeholders override any remote `.env.local`
backend. Browse SSR falls back to empty collections when the local DB is absent;
this is not a database or listing-data qualification.

```sh
SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=schema-local-placeholder \
NEXT_PUBLIC_SUPABASE_ANON_KEY=schema-local-placeholder \
UPSTASH_REDIS_REST_URL=http://127.0.0.1:4413 \
UPSTASH_REDIS_REST_TOKEN=schema-local-placeholder \
API_BASE_URL=http://localhost:4318 \
SITE_URL=https://clawdeals.com TESTERARMY_AI=0 \
PARITY_OUTPUT=.e2e/validation/schema-UNIQUE \
  npm run test:testerarmy -- e2e/testerarmy/structured-data.e2e.ts
npm run test:unit -- src/__tests__/pages/marketing-ssr-schema.test.tsx
```

The E2E suite reads the real HTTP HTML for every sitemap URL, checks parsed JSON-LD,
canonicals/languages, unique graph IDs, ordered localized breadcrumbs, article
identity/date/author, step anchors and visible FAQ correspondence. It also opens
homepage FAQ answers and checks client navigation/language changes for stale or
duplicate scripts. The existing SSR suite covers safe JSON serialization.

Keep `command.json`, `completion.json`, `report.json`, `summary.md`, logs and traces
from the selected `.e2e/validation/schema-*` run; the wrapper records source hashes.
Run `npm run verify:pr` after committing and before pushing. Its commit proof is
separate from browser evidence and any future production/build verification.

## Audit evidence and limits

- Before fix: `.e2e/validation/schema-baseline` failed with zero JSON-LD scripts
  in the homepage HTTP response (expected one).
- Initial corrected run: `.e2e/validation/schema-after`, four desktop cases passed
  including all 54 URL responses. The final run below supersedes this intermediate
  result for the final test coverage.
- Public HTTP fetches from this environment returned 403 for the sampled routes;
  they do not establish the current deployed JSON-LD. The public search fetch showed
  older deployment `6dc1a48`. No production request or deployment applied these changes.
- Existing guide/feature code examples trigger next-intl formatting diagnostics;
  local browse SSR reports the absent placeholder DB. These are outside the JSON-LD
  change and are not evidence of failed schema parsing.
- External code-mode validation of the actual local graph: Schema.org Validator
  reported **0 errors, 0 warnings** for the homepage and MCP security checklist.
  The [Google Rich Results Test](https://search.google.com/test/rich-results/result?id=UfGkyf8mMRAwvUHlIR1-YA)
  detected **2 valid items** on the checklist: Article and BreadcrumbList. Article
  has four non-critical recommendations (time and timezone for published/modified
  dates). The content stores only calendar dates; these accurate Schema.org Date
  values are retained instead of inventing publication times. This is validation
  of submitted code, not an inspection of deployed content or indexation.
- Final run: `.e2e/validation/schema-verified`, **8/8 cases passed**, desktop and
  mobile, with `--no-cache`. All 54 URLs were checked per target, plus visible
  homepage answers and client navigation. `completion.json` records the source
  hashes; no application/test code changed after this run. A preceding test-only
  failure compared CSS-uppercase questions case-sensitively; the final assertion
  ignores letter case while still comparing the complete question and answer.
- Existing SSR/escaping regression suite: **15/15 passed**. TypeScript and ESLint
  on all changed TS/TSX files passed. The mandatory committed-tree `verify:pr`
  result and exact verified SHA are recorded in the PR.
