# Release evidence — 26 August 2026

Evidence captured after the first public push of the WebMCP Challenge implementation.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Clean-clone candidate SHA: `3f1057541ac3fd523fbc89f0ea4b367e52077026`
- Current reviewed runtime candidate SHA: `fc29e6659d5afa3bca9e64774693e81895836cef`; later documentation-only descendants do not change this runtime proof
- Latest security hardening SHA: `fc29e6659d5afa3bca9e64774693e81895836cef`
- Reviewed implementation SHA: `2ed489d5a5086f449c9985d9627f2d024032e3a3`. Later documentation-only descendants may change the public deploy SHA without changing this runtime implementation.
- Pre-challenge baseline: `webmcp-challenge-baseline` → `00880457964929c0773237a9c724704f5da651f0`

## Evidence matrix

| Layer | Status | Evidence |
| --- | --- | --- |
| LOCAL release gate | PASS | Clean clone of `3f10575`: migrations + synthetic seed, 373 Vitest files / 2,616 passed / 1 skipped, build, selector 24 × 3, contracts 79/79, UI 5/5, journey 2/2, security 10/10. |
| LOCAL hardening gate | PASS on `3739c7c` / `7b52d94` | 375 Vitest files / 2,627 passed / 1 skipped, typecheck, lint, 109-page production build, contracts 81/81, WebMCP UI 5/5, release preflight and a runtime Origin Trial meta probe all passed. |
| LOCAL current candidate | PASS on clean `2ed489d` | `npm run release:hackathon:local` exited 0: typecheck, lint, 377 Vitest files / 2,634 passed / 1 skipped, 109-page build, selector 24 × 3, contracts 82/82, UI 6/6, journey 2/2 and security 10/10. It includes cross-route receipt persistence, the deterministic Upstash mock and `Origin-Agent-Cluster: ?1`. |
| LOCAL current reviewed runtime candidate | PASS for non-database layers on clean `fc29e66` | Release preflight, typecheck, lint, 381 Vitest files / 2,667 passed / 1 skipped, 109-page build, selector 24 × 3, contracts 82/82 and Chromium UI 6/6 passed on 27 August. Journey and security were not rerun on this SHA because the local OrbStack engine was unresponsive and the public branch was intentionally not used as a substitute. |
| LOCAL GitHub-workflow replay | PASS | Node 24.19.0 / npm 11.17.0 replayed the exact `CI` commands: lint, typecheck and contracts, two unit shards (1,370 passed + 1 skipped; 1,246 passed), Worker contracts (14 passed), and Wrangler dry-run. TypeScript SDK generation was deterministic, typechecked, and passed 3 runtime tests. Python 3.11.15 generation was deterministic, imported successfully, and passed 2 tests. |
| CI historical | PASS | [`CI` run 32959645029](https://github.com/thannous/clawdeals/actions/runs/32959645029) and [`SDK CI` run 32959645020](https://github.com/thannous/clawdeals/actions/runs/32959645020) completed successfully on `3f10575`; [`CI` run 32980551636](https://github.com/thannous/clawdeals/actions/runs/32980551636) passed on `9e7102e`. |
| CI current HEAD | WAIVED / NOT RUN on `fc29e66` | The owner explicitly waived fresh remote GitHub Actions runs and asked to ignore the zero-dollar Actions budget. This row is neither PASS nor FAIL. |
| DEPLOYED | PASS on `2ed489d` | Vercel status `Deployment has completed`: https://vercel.com/thanhs-projects-9baa3976/clawdeals/GZj3bRhSY4svbqbPVoPUwCs6Yx79 |
| PUBLIC HTTP | PASS on `2ed489d` | `https://clawdeals.com/webmcp-challenge` returned HTTP 200 and displayed `2ed489d5a508`; `/browse` returned 200; both emitted `Origin-Agent-Cluster: ?1`; production `GET /api/v1/sandbox/reset` returned 404; and `GET /api/v1/public/listings?limit=1` returned 200. |
| PUBLIC incognito read-only | PASS on `1b52e64` | Fresh Chromium context: challenge page 200, displayed SHA `1b52e64799fd`, no stored key, public listings 200, production sandbox GET 404. See [`PUBLIC_SMOKE_2026-08-26.md`](./PUBLIC_SMOKE_2026-08-26.md). |
| PUBLIC deployed registry wiring | PASS on `1b52e64` with explicit mock boundary | A separate clean context injected `document.modelContext` and observed the exact five guest tools. This is deployed wiring proof, not native Chrome/ChatGPT proof. |
| PUBLIC native in-app read path | PASS on `2ed489d` | Codex in-app discovered five tools, executed `get_page_context` → `search_listings`, moved to `/browse?q=e-bike`, rediscovered the same five tools there and executed `get_action_receipt` without returning to the hub. Receipt data kept coordinates and secrets redacted. See [`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md). |
| REMOTE sandbox infrastructure | PARTIAL | Persistent data-less Supabase branch `webmcp-sandbox` and empty Vercel project `clawdeals-staging` exist. Non-sensitive Vercel configuration is present. Redis, sensitive staging variables, final migrations, Git deployment and DNS remain pending. |
| PUBLIC authenticated journey | PENDING | The eleven-tool authenticated registry, sandbox reset and critical mutation path have not been proved on a final public sandbox host. The isolated Supabase/Vercel base exists, but Redis, secrets, final migrations, deployment and DNS are incomplete; see [`PUBLIC_SANDBOX_PLAN_2026-08-26.md`](./PUBLIC_SANDBOX_PLAN_2026-08-26.md). Production stays non-sandbox. |
| CHROME native | INDETERMINATE on `9e7102e` | Connected Chrome 151 loaded the final build but exposed no `document.modelContext`; the managed browser could not inspect or change `chrome://flags`. |
| ORIGIN-AGENT-CLUSTER | LOCAL + PUBLIC PASS on `2ed489d` | The config contract passes; local and public probes on `/webmcp-challenge` and `/browse` returned 200 with `Origin-Agent-Cluster: ?1`. |
| ORIGIN TRIAL | CONFIGURATION PENDING | The repository has an optional global meta hook, but no token is committed or proven active on the judged origin. |
| CHATGPT | NOT RUN on current release | Real ChatGPT in-app selection and execution remains separate from the Codex in-app proof, HTTP and CI. |
| SECRET AUDIT | PASS | GitHub Secret Scanning: 0 alerts. Gitleaks 8.30.1: 492 commits and candidate tree reviewed; 0 confirmed secrets after false-positive triage. See [`SECRET_AUDIT_2026-08-26.md`](./SECRET_AUDIT_2026-08-26.md). |
| VIDEO LOCAL | PASS | Regenerated after the final gate: 160-second 1080p H.264/AAC artifact, 7,102,105 bytes, SHA-256 `929d74fa5aada1c4da18044f91f649b2788aeb9a10492a5f375dfbd9d1b80fd3`. See [`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md). |
| VIDEO PUBLIC / DEVPOST | PENDING | Public YouTube URL, final Devpost fields, submission, and post-submission freeze are not proven. |

## Boundary

The HTTP and incognito checks prove public routing, deployed-SHA visibility,
production reset closure and guest registration wiring under an explicit
compatibility injection. The Codex in-app execution separately proves native
public tool discovery, selection, shared-UI navigation and a redacted receipt.
They do not prove ChatGPT's separate runtime, Chrome with its experimental flag
enabled, an authenticated public sandbox journey, a public video, or Devpost
acceptance.

The current-HEAD GitHub Actions rerun was explicitly waived after GitHub kept
both dispatch records before job creation. Historical green CI, current local
validation, Vercel deployment and public HTTP behavior remain separate evidence
and must not be collapsed into a synthetic current-CI pass.
