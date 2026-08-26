# Release evidence — 26 August 2026

Evidence captured after the first public push of the WebMCP Challenge implementation.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Candidate implementation SHA: `3f1057541ac3fd523fbc89f0ea4b367e52077026`
- Pre-challenge baseline: `webmcp-challenge-baseline` → `00880457964929c0773237a9c724704f5da651f0`

## Evidence matrix

| Layer | Status | Evidence |
| --- | --- | --- |
| LOCAL release gate | PASS | Clean clone of `3f10575`: migrations + synthetic seed, 373 Vitest files / 2,616 passed / 1 skipped, build, selector 24 × 3, contracts 79/79, UI 5/5, journey 2/2, security 10/10. |
| LOCAL GitHub-workflow replay | PASS | Node 24.19.0 / npm 11.17.0 replayed the exact `CI` commands: lint, typecheck and contracts, two unit shards (1,370 passed + 1 skipped; 1,246 passed), Worker contracts (14 passed), and Wrangler dry-run. TypeScript SDK generation was deterministic, typechecked, and passed 3 runtime tests. Python 3.11.15 generation was deterministic, imported successfully, and passed 2 tests. |
| CI | PASS | [`CI` run 32959645029](https://github.com/thannous/clawdeals/actions/runs/32959645029) and [`SDK CI` run 32959645020](https://github.com/thannous/clawdeals/actions/runs/32959645020) completed successfully on `3f10575`. |
| DEPLOYED | PASS | GitHub's Vercel commit status for `3f10575` reported `Deployment has completed`. |
| PUBLIC HTTP | PASS | `https://clawdeals.com/webmcp-challenge` returned HTTP 200 with `x-matched-path: /en/webmcp-challenge` and displayed deploy SHA `3f10575`; `https://clawdeals.com/webmcp` also returned HTTP 200. |
| PUBLIC private-window journey | PENDING | Full page → tools → API/reset → critical-path smoke has not yet been rerun in a private browser on this deployed SHA. |
| CHATGPT | NOT RUN on candidate | Real ChatGPT in-app selection and execution on `3f10575` remains separate from HTTP and CI proof. |
| VIDEO / DEVPOST | PENDING | The final public video, final Devpost fields, submission, and post-submission freeze are not proven. |

## Boundary

The HTTP checks prove public routing and deployed-SHA visibility. They do not prove native browser WebMCP selection, authenticated sandbox reset, the complete negotiation journey, or Devpost acceptance.
