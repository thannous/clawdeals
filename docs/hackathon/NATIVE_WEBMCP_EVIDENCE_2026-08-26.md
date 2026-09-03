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

## Connected Chrome — historical INDETERMINATE on 26 August

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

## Connected Chrome — native runtime and registry PASS on 3 September

The user enabled `chrome://flags/#enable-webmcp-testing`, relaunched the
connected Chrome 151 profile and opened
`https://sandbox.clawdeals.com/webmcp-challenge` on deployed build
`23af2a7cd2a6`.

The live judge hub then reported all of the following from the browser runtime:

- `Runtime Enabled`;
- `Browser API Supported`;
- `Registry 11 tools registered`;
- `getTools()`, `toolchange` and the visible registry matched;
- the exact authenticated set was `get_page_context`, `show_listings`,
  `open_listing`, `search_listings`, `create_buy_mission`, `start_thread`,
  `send_message`, `make_offer`, `respond_to_offer`,
  `request_contact_reveal`, `get_action_receipt`.

This is native Chrome runtime and registry proof. It is not yet native Chrome
tool-execution proof: the official WebMCP Model Context Tool Inspector was not
installed in the connected profile, so no Inspector-driven invocation or
request ID was recorded. It also does not prove the separate ChatGPT in-app
runtime.

## Public sandbox synthetic seller turn — PASS on 3 September

In the isolated public sandbox, the authenticated eleven-tool registry created
a synthetic Paris e-bike mission with a 1,300 EUR hard budget. A native
`make_offer` call prepared and, after explicit human approval, created a 1,100
EUR offer. The visible redacted receipt reported `SUCCESS`, `CREATED`,
`APPROVED BY YOU` and `SERVER ACCEPTED`, with request ID
`9066a16a-4a43-4357-8c68-ac6b8dd8a3f3`.

The **Let the synthetic seller respond** control was then clicked exactly once.
The seller countered at 1,350 EUR, above the mission's 1,300 EUR hard budget,
and the live UI stated that a buyer accept would return `APPROVAL_REQUIRED` and
hand the decision back to the owner. No second seller response was requested,
and the above-budget counter was not accepted in this browser session.

The local isolated-Supabase `eval:webmcp:journey` and
`eval:webmcp:security` suites were replayed separately on 3 September and passed
2/2 and 10/10 respectively. Those automated results verify the policy behavior;
they are not relabelled as native browser execution.
