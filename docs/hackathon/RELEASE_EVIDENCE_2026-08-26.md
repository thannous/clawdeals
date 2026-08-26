# Release evidence — 26 August 2026

Evidence captured after the first public push of the WebMCP Challenge implementation.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Candidate implementation SHA: `3f1057541ac3fd523fbc89f0ea4b367e52077026`
- Current public proof SHA: `9e7102ea4dcc879aa1f5ffb4e68bb712cf11c96e`
- Pre-challenge baseline: `webmcp-challenge-baseline` → `00880457964929c0773237a9c724704f5da651f0`

## Evidence matrix

| Layer | Status | Evidence |
| --- | --- | --- |
| LOCAL release gate | PASS | Clean clone of `3f10575`: migrations + synthetic seed, 373 Vitest files / 2,616 passed / 1 skipped, build, selector 24 × 3, contracts 79/79, UI 5/5, journey 2/2, security 10/10. |
| LOCAL GitHub-workflow replay | PASS | Node 24.19.0 / npm 11.17.0 replayed the exact `CI` commands: lint, typecheck and contracts, two unit shards (1,370 passed + 1 skipped; 1,246 passed), Worker contracts (14 passed), and Wrangler dry-run. TypeScript SDK generation was deterministic, typechecked, and passed 3 runtime tests. Python 3.11.15 generation was deterministic, imported successfully, and passed 2 tests. |
| CI | PASS | [`CI` run 32959645029](https://github.com/thannous/clawdeals/actions/runs/32959645029) and [`SDK CI` run 32959645020](https://github.com/thannous/clawdeals/actions/runs/32959645020) completed successfully on `3f10575`. |
| DEPLOYED | PASS | GitHub's Vercel commit status for `3f10575` reported `Deployment has completed`. |
| PUBLIC HTTP | PASS | `https://clawdeals.com/webmcp-challenge` returned HTTP 200 with `x-matched-path: /en/webmcp-challenge` and displayed deploy SHA `3f10575`; `https://clawdeals.com/webmcp` also returned HTTP 200. |
| PUBLIC incognito read-only | PASS on `1b52e64` | Fresh Chromium context: challenge page 200, displayed SHA `1b52e64799fd`, no stored key, public listings 200, production sandbox GET 404. See [`PUBLIC_SMOKE_2026-08-26.md`](./PUBLIC_SMOKE_2026-08-26.md). |
| PUBLIC deployed registry wiring | PASS on `1b52e64` with explicit mock boundary | A separate clean context injected `document.modelContext` and observed the exact five guest tools. This is deployed wiring proof, not native Chrome/ChatGPT proof. |
| PUBLIC native in-app read path | PASS on `9e7102e` | Codex in-app browser discovered the five live tools and executed `get_page_context` → `search_listings` → `get_action_receipt`; the shared UI moved to `/browse?q=e-bike` and receipt data stayed redacted. See [`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md). |
| PUBLIC authenticated journey | PENDING | The eleven-tool authenticated registry, sandbox reset and critical mutation path have not been proved on a final public sandbox host. DNS, isolated services and staging secrets are not provisioned; see [`PUBLIC_SANDBOX_PLAN_2026-08-26.md`](./PUBLIC_SANDBOX_PLAN_2026-08-26.md). Production stays non-sandbox. |
| CHROME native | INDETERMINATE on `9e7102e` | Connected Chrome 151 loaded the final build but exposed no `document.modelContext`; the managed browser could not inspect or change `chrome://flags`. |
| ORIGIN TRIAL | CONFIGURATION PENDING | The repository has an optional global meta hook, but no token is committed or proven active on the judged origin. |
| CHATGPT | NOT RUN on `9e7102e` | Real ChatGPT in-app selection and execution remains separate from the Codex in-app proof, HTTP and CI. |
| SECRET AUDIT | PASS | GitHub Secret Scanning: 0 alerts. Gitleaks 8.30.1: 492 commits and candidate tree reviewed; 0 confirmed secrets after false-positive triage. See [`SECRET_AUDIT_2026-08-26.md`](./SECRET_AUDIT_2026-08-26.md). |
| VIDEO LOCAL | PASS | 160-second 1080p H.264/AAC artifact, SHA-256 recorded in [`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md). |
| VIDEO PUBLIC / DEVPOST | PENDING | Public YouTube URL, final Devpost fields, submission, and post-submission freeze are not proven. |

## Boundary

The HTTP and incognito checks prove public routing, deployed-SHA visibility,
production reset closure and guest registration wiring under an explicit
compatibility injection. The Codex in-app execution separately proves native
public tool discovery, selection, shared-UI navigation and a redacted receipt.
They do not prove ChatGPT's separate runtime, Chrome with its experimental flag
enabled, an authenticated public sandbox journey, a public video, or Devpost
acceptance.
