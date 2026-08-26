# Native WebMCP evidence — 26 August 2026

This report separates a real in-app WebMCP execution from Chrome flag testing
and from mocked browser wiring. No production mutation was performed.

## Codex in-app browser — PASS for the public read path

At `2026-08-26T17:21Z`, the Codex in-app browser opened
`https://clawdeals.com/webmcp-challenge` on deployed build
`2ed489d5a5086f449c9985d9627f2d024032e3a3`.

The browser's native WebMCP capability discovered exactly these five tools from
the live document:

1. `get_page_context`
2. `show_listings`
3. `open_listing`
4. `search_listings`
5. `get_action_receipt`

The observed native tool sequence was:

1. `get_page_context` returned `/webmcp-challenge` with request ID
   `8d6975ba-279d-4c42-aaad-914225764fd0`.
2. `search_listings` received the Paris e-bike read criteria, returned `ok: true`,
   and updated the shared UI to `/browse?q=e-bike`. Production contained no
   matching public listing, so the result set was empty. Request ID:
   `ec572532-5994-4145-96e9-2095d592e666`.
3. The Agent Activity UI showed the successful call, redacted latitude and
   longitude, the policy decision `read_completed`, an input hash, and receipt
   derived from request `ec572532-5994-4145-96e9-2095d592e666`.
4. On `/browse`, native discovery still returned the exact same five tools,
   including `get_action_receipt`. The browser retrieved the search receipt
   there without returning to the challenge hub. It preserved the redactions
   and returned no API key, cookie, token, email address, phone number or raw
   contact data. Receipt-read request ID:
   `df16a0fb-2cc6-4619-9989-12fcb652a802`.

This is real in-app tool discovery and execution. It is not a Playwright mock.
It proves the deployed public five-tool read path, contextual registry change,
shared UI update and redacted receipt retrieval.

## Evidence boundary

- The selected runtime identified itself as **Codex In-app Browser**. This does
  not prove the separate ChatGPT in-app browser row.
- The session had no agent key. It does not prove the eleven-tool authenticated
  registry or any mutation path.
- The public production host correctly kept `/api/v1/sandbox/reset` unavailable.
- No screenshot was retained: the browser capture command timed out. The native
  discovery, tool return payloads, page transition and receipt were observed
  directly in the connected browser session.
- Public HEAD `2ed489d5a508` includes the cross-route receipt fix. Independent
  HTTP probes also observed `Origin-Agent-Cluster: ?1` on both
  `/webmcp-challenge` and `/browse`.
- Historical build `b9fc2e3` required returning to the hub to read the receipt;
  the current native sequence proves that gap is closed.

## Connected Chrome — INDETERMINATE

The previously connected external browser reported `Chrome/151.0.0.0` and
loaded the then-current reviewed deployment. Its page exposed neither `document.modelContext`
nor `document.modelContext.registerTool`; the challenge UI reported `Browser API
Not detected` and `No active registration`.

The managed browser could not open `chrome://flags`, so the exact flag value was
not inspected and no browser setting was changed. The result is therefore
**INDETERMINATE**, not a product failure.

Current Chrome documentation says that WebMCP is available from Chrome 149 as
an origin trial, and that local testing requires enabling
`chrome://flags/#enable-webmcp-testing` and relaunching Chrome:

- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/blog/new-in-devtools-149
- https://webmachinelearning.github.io/webmcp/

After the flag is enabled and Chrome is relaunched, repeat the five-tool
discovery and the read-only tool sequence above. Do not run the authenticated
sandbox reset or mutation journey against production.

The repository supports optional public Origin Trial delivery through
`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN`, rendered as a global
`<meta http-equiv="origin-trial">` only when configured. No token value is
committed, and the observed public build had no Origin Trial header or meta, so
this hook does not change the Chrome verdict until a live token is configured
and independently verified.
