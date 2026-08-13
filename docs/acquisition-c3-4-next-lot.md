# C3.4 — Activation conversion decision lot

## Baseline

- Publication C3.1: `8a7c6a7160e0e41a9060f93e2fc983aee6fe5d47`, 2026-07-27 18:58:02 UTC.
- J+14 verified funnel: 34 `landing_view`, 2 `connect_cta_clicked`, 0 backend activation.
- Diagnosis: no `connect_sessions` and no agents were created after C3.1. The observed drop is before activation, but two clicks are not enough to select a winning UX treatment.
- C3.3 instrumentation adds `activation_started`, preserves `acq_id` through authentication, attributes API/MCP/Claim paths, and separates verified connection from credential generation.

## Decision gates

Run this lot after at least one of these thresholds is reached:

- 20 attributed `connect_cta_clicked`; or
- 7 complete days after the C3.3 production deployment.

Read only aggregate, privacy-minimized rows. Compare:

1. `connect_cta_clicked → activation_started` by CTA location, channel, locale, and interaction type.
2. `activation_started → agent_connected` by connection method.
3. `agent_connected → watchlist_created → first_match → d7_retained`.
4. Released escrow coverage, gross volume, and platform revenue by currency; never combine currencies or call gross volume revenue.

## Decision matrix

- Clicks < 20 and no severe runtime error: keep collecting; no A/B test.
- `click → started` < 25% with at least 20 clicks: ship one focused `/start` treatment that foregrounds the lowest-friction method for marketing traffic.
- `started → connected` < 50% with at least 10 starts: fix verification/onboarding friction before changing acquisition copy.
- Any API error rate > 2% or tracking mismatch > 5%: hold UX changes and repair instrumentation first.

## Candidate treatment

For attributed marketing traffic only, test a compact choice above the fold:

- primary: generate API/MCP credentials;
- secondary: Claim Link for remote agents;
- persistent sign-in return preserving locale, source, and `acq_id`.

Do not launch the experiment until the sample gate is met. The required authorization is a separate production UX experiment approval after the aggregate review.

## Verification checklist

- Confirm deployment SHA and public `/fr/start` behavior independently.
- Confirm `activation_started` and `agent_connected` with aggregate Supabase queries only.
- Confirm the acquisition console loads 7d/30d/90d and keeps currency-separated revenue.
- Recheck Supabase security and performance advisors after the migration.
- Do not request indexing, run a paid crawl, or change GSC/Ahrefs/Supabase configuration.
