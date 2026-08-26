# Public smoke evidence — 26 August 2026

Read-only production smoke captured against `https://clawdeals.com` on deployed documentation SHA `1b52e64799fd6dd23f3727dc2287e3655bff370f`.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Release ticket: [TI-376](https://linear.app/ti-max/issue/TI-376/hackathon-produire-un-build-reproductible-et-une-preuve-live-stable)

## Safety boundary

- Fresh Playwright Chromium contexts with no cookies, storage state or agent key.
- GET/navigation only on production.
- No production reset POST, no key creation, no offer, mission, approval or contact mutation.
- The sandbox capability was probed with GET only; production returned `404` before authentication.

## Public incognito result

Captured at `2026-08-26T14:20:20.016Z`.

| Check | Result |
| --- | --- |
| `/webmcp-challenge` | PASS — HTTP 200 |
| Deployed SHA rendered by the page | PASS — `1b52e64799fd` |
| Fresh local agent key | PASS — absent |
| Stock Chromium `document.modelContext` | `undefined` |
| Hub compatibility state | `Browser API — Not detected` |
| Native registry in stock Chromium | `No active registration` |
| `GET /api/v1/sandbox/reset` | PASS — 404 on production |
| `GET /api/v1/public/listings?limit=1` | PASS — HTTP 200 |

The missing browser API is **INDETERMINATE**, not a product failure: stock Playwright Chromium is not a Chrome profile with WebMCP testing enabled and is not ChatGPT's in-app browser.

## Deployed registration wiring

A second clean context injected only a test `document.modelContext.registerTool` surface. It made no production mutation and proved the deployed JavaScript registered the exact guest registry:

```text
get_page_context
show_listings
open_listing
search_listings
get_action_receipt
```

Additional checks passed:

- launch target is `/webmcp`;
- the copied mission contains the 1,300 EUR hard budget;
- the copied mission requires bilateral approval;
- the page still renders deployed SHA `1b52e64799fd`.

This injected context proves deployed registration wiring only. It is **not**
native Chrome or ChatGPT WebMCP evidence. A later connected Codex in-app browser
run did execute the live public tools natively; see
[`NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`](./NATIVE_WEBMCP_EVIDENCE_2026-08-26.md).

## Remaining public proof

- Codex in-app native public read path: **PASS on `9e7102e`**.
- Real Chrome WebMCP with the supported profile/flag: **INDETERMINATE on Chrome 151; runtime not active**.
- ChatGPT in-app tool selection and execution: **NOT RUN**.
- Authenticated eleven-tool registry and the mutation journey: sandbox only; **NOT RUN on a final public sandbox host**.
- Production remains intentionally non-sandbox and must never run the synthetic reset or critical mutation journey.

The live-browser evidence tables remain in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md` and must not be marked complete from this smoke.
