# Release evidence — 26 August 2026

Evidence captured after the first public push of the WebMCP Challenge implementation.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Clean-clone candidate SHA: `3f1057541ac3fd523fbc89f0ea4b367e52077026`
- Current reviewed runtime candidate SHA: `fc29e6659d5afa3bca9e64774693e81895836cef`; later documentation-only descendants do not change this runtime proof
- Public sandbox runtime fix: `deb00e3` (`proxy.ts` on the Node.js runtime); Vercel deployment `dpl_5qjh93UvcATeEcZpC8SNn1VJEuqJ`
- Latest security hardening SHA: `fc29e6659d5afa3bca9e64774693e81895836cef`
- Reviewed implementation SHA: `2ed489d5a5086f449c9985d9627f2d024032e3a3`. Later documentation-only descendants may change the public deploy SHA without changing this runtime implementation.
- Pre-challenge baseline: `webmcp-challenge-baseline` → `00880457964929c0773237a9c724704f5da651f0`
- Official rules rechecked on 29 August 2026: https://webmcp.devpost.com/rules — judges may use ChatGPT's in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`; the required video must be public on YouTube, include audio and remain under three minutes.

## Evidence matrix

| Layer | Status | Evidence |
| --- | --- | --- |
| LOCAL release gate | PASS | Clean clone of `3f10575`: migrations + synthetic seed, 373 Vitest files / 2,616 passed / 1 skipped, build, selector 24 × 3, contracts 79/79, UI 5/5, journey 2/2, security 10/10. |
| LOCAL hardening gate | PASS on `3739c7c` / `7b52d94` | 375 Vitest files / 2,627 passed / 1 skipped, typecheck, lint, 109-page production build, contracts 81/81, WebMCP UI 5/5, release preflight and a runtime Origin Trial meta probe all passed. |
| LOCAL current candidate | PASS on clean `2ed489d` | `npm run release:hackathon:local` exited 0: typecheck, lint, 377 Vitest files / 2,634 passed / 1 skipped, 109-page build, selector 24 × 3, contracts 82/82, UI 6/6, journey 2/2 and security 10/10. It includes cross-route receipt persistence, the deterministic Upstash mock and `Origin-Agent-Cluster: ?1`. |
| LOCAL current reviewed runtime candidate | PASS for non-database layers on clean `fc29e66` | Release preflight, typecheck, lint, 381 Vitest files / 2,667 passed / 1 skipped, 109-page build, selector 24 × 3, contracts 82/82 and Chromium UI 6/6 passed on 27 August. Journey and security were not rerun on this SHA because the local OrbStack engine was unresponsive and the public branch was intentionally not used as a substitute. |
| LOCAL current WebMCP patch | PASS on clean `60b99f7` | Fresh typecheck and full lint passed; 381 Vitest files / 2,668 tests passed / 1 skipped. Local Supabase reset applied every migration, journey passed 2/2 and security passed 10/10. The final capture passed 1/1 and proves the e-bike search result remains structured under the 1,500-byte UTF-8 cap. |
| LOCAL GitHub-workflow replay | PASS | Node 24.19.0 / npm 11.17.0 replayed the exact `CI` commands: lint, typecheck and contracts, two unit shards (1,370 passed + 1 skipped; 1,246 passed), Worker contracts (14 passed), and Wrangler dry-run. TypeScript SDK generation was deterministic, typechecked, and passed 3 runtime tests. Python 3.11.15 generation was deterministic, imported successfully, and passed 2 tests. |
| CI historical | PASS | [`CI` run 32959645029](https://github.com/thannous/clawdeals/actions/runs/32959645029) and [`SDK CI` run 32959645020](https://github.com/thannous/clawdeals/actions/runs/32959645020) completed successfully on `3f10575`; [`CI` run 32980551636](https://github.com/thannous/clawdeals/actions/runs/32980551636) passed on `9e7102e`. |
| CI current HEAD | WAIVED / NOT RUN | The owner explicitly waived fresh remote GitHub Actions runs and asked to ignore the zero-dollar Actions budget. This row is neither PASS nor FAIL; current local, deployed and public evidence remain separate from historical green CI. |
| DEPLOYED | PASS on production hub for `f276332` containing runtime `60b99f7` | On 29 August, the Vercel-backed public hub rendered the full documentation descendant `f276332bfba7cbdd2ec1390425434866fbaa91a3`. This is production-hub deployment proof, not the isolated authenticated sandbox. |
| PUBLIC HTTP | PASS on `f276332` containing runtime `60b99f7` | `https://clawdeals.com/webmcp-challenge` returned 200 with `Origin-Agent-Cluster: ?1`; `GET /api/v1/public/listings?limit=1` returned 200; production `GET /api/v1/sandbox/reset` remained 404. Native WebMCP, the sandbox journey and database migration state remain separate. |
| PUBLIC incognito read-only | PASS on `1b52e64` | Fresh Chromium context: challenge page 200, displayed SHA `1b52e64799fd`, no stored key, public listings 200, production sandbox GET 404. See [`PUBLIC_SMOKE_2026-08-26.md`](./PUBLIC_SMOKE_2026-08-26.md). |
| PUBLIC deployed registry wiring | PASS on `1b52e64` with explicit mock boundary | A separate clean context injected `document.modelContext` and observed the exact five guest tools. This is deployed wiring proof, not native Chrome/ChatGPT proof. |
| PUBLIC native in-app read path | PASS on `2ed489d` | Codex in-app discovered five tools, executed `get_page_context` → `search_listings`, moved to `/browse?q=e-bike`, rediscovered the same five tools there and executed `get_action_receipt` without returning to the hub. Receipt data kept coordinates and secrets redacted. See [`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md). |
| REMOTE sandbox infrastructure | PASS on 30 August | The isolated Supabase branch has the final challenge migrations and deterministic synthetic actors. Dedicated Upstash Redis, masked staging secrets, DNS and TLS are provisioned. Vercel project `clawdeals-staging` is connected to `thannous/clawdeals`, uses the Next.js preset and reports deployment `dpl_5qjh93UvcATeEcZpC8SNn1VJEuqJ` Ready for `deb00e3`. |
| PUBLIC authenticated journey | PASS on sandbox runtime `deb00e3` | Anonymous and authenticated public verifiers passed. A Playwright browser journey under explicit `document.modelContext` compatibility injection exposed exactly eleven tools, reset deterministic fixtures, created a mission and 1,150 EUR offer, accepted as the seller, observed atomic `RESERVED`, validated the redacted <=1,500-byte receipt, replayed acceptance idempotently and reset again: 1/1 in 6.7 s. Production reset remains 404. This is deployed authenticated wiring and behavior proof, not native Chrome or ChatGPT proof. |
| CHROME native | INDETERMINATE on `9e7102e` | Connected Chrome 151 loaded the final build but exposed no `document.modelContext`; the managed browser could not inspect or change `chrome://flags`. |
| ORIGIN-AGENT-CLUSTER | LOCAL + PUBLIC PASS on `2ed489d` | The config contract passes; local and public probes on `/webmcp-challenge` and `/browse` returned 200 with `Origin-Agent-Cluster: ?1`. |
| CHROME ACTIVATION PATH | DOCUMENTED / RUNTIME INDETERMINATE | The official rules permit Chrome 149+ with `chrome://flags/#enable-webmcp-testing`; an Origin Trial token is optional, not a submission requirement. The managed Chrome profile used for evidence did not expose a native runtime, so Chrome execution remains unproven. |
| CHATGPT | NOT RUN on current release | Real ChatGPT in-app selection and execution remains separate from the Codex in-app proof, HTTP and CI. |
| SECRET AUDIT | PASS | GitHub Secret Scanning: 0 alerts. Gitleaks 8.30.1: 492 commits and candidate tree reviewed; 0 confirmed secrets after false-positive triage. See [`SECRET_AUDIT_2026-08-26.md`](./SECRET_AUDIT_2026-08-26.md). |
| VIDEO LOCAL | PASS on 29 August | The current gitignored MP4 exists and independently probes as 160 seconds, H.264 1920×1080 plus AAC 48 kHz stereo. SHA-256: `ed2372ac304cdb81527c1da97d8b71e199e4153c24612b2a9dad07c39961315d`. Publication remains separate. See [`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md). |
| VIDEO PUBLIC / DEVPOST | PENDING | Public YouTube URL, final Devpost fields, submission, and post-submission freeze are not proven. |

## Boundary

The HTTP and incognito checks prove public routing, deployed-SHA visibility,
production reset closure and guest registration wiring under an explicit
compatibility injection. The Codex in-app execution separately proves native
public tool discovery, selection, shared-UI navigation and a redacted receipt.
They do not prove ChatGPT's separate runtime, Chrome with its experimental flag
enabled, a public video, or Devpost acceptance. The authenticated sandbox row
is proven separately through an explicit compatibility injection and therefore
must not be cited as native browser WebMCP selection.

The current-HEAD GitHub Actions rerun was explicitly waived after GitHub kept
both dispatch records before job creation. Historical green CI, current local
validation, Vercel deployment and public HTTP behavior remain separate evidence
and must not be collapsed into a synthetic current-CI pass.
