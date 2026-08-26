# Native WebMCP evidence — 26 August 2026

This report separates a real in-app WebMCP execution from Chrome flag testing
and from mocked browser wiring. No production mutation was performed.

## Codex in-app browser — PASS for the public read path

At `2026-08-26T14:37:58.831Z`, the Codex in-app browser opened
`https://clawdeals.com/webmcp-challenge` on deployed build
`b9fc2e346ab59b5c626f42532b6b8c7b781def38`.

The browser's native WebMCP capability discovered exactly these five tools from
the live document:

1. `get_page_context`
2. `show_listings`
3. `open_listing`
4. `search_listings`
5. `get_action_receipt`

The observed native tool sequence was:

1. `get_page_context` returned `/webmcp-challenge` with request ID
   `52c27d83-989c-4020-89da-c3e7d7463f38`.
2. `search_listings` received the Paris e-bike read criteria, returned `ok: true`,
   and updated the shared UI to `/browse?q=e-bike`. Production contained no
   matching public listing, so the result set was empty. Request ID:
   `2fea2f5a-a2c2-47ab-b495-8a992452bcd5`.
3. The Agent Activity UI showed the successful call, redacted latitude and
   longitude, the policy decision `read_completed`, an input hash, and receipt
   `rcpt_2fea2f5a-a2c2-47ab-b495-8a992452bcd5`.
4. Public `b9fc2e3` dropped `get_action_receipt` after navigation to `/browse`,
   so the session returned to `/webmcp-challenge` and retrieved the receipt
   through WebMCP there. It preserved the redactions and returned no API key,
   cookie, token, email address, phone number or raw contact data. Receipt-read
   request ID: `195c279c-2af5-4a76-8479-b2d6ed05e528`. The current local
   candidate fixes this cross-route gap and has a dedicated UI regression test.

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
- Public HEAD `b9fc2e346ab5` still does **not** include the uncommitted local
  worktree that keeps `get_action_receipt` registered on `/browse`, adds a local
  Upstash mock, and emits `Origin-Agent-Cluster: ?1`. That work remains
  **LOCAL PENDING COMMIT / DEPLOY**.

## Connected Chrome — INDETERMINATE

The connected external browser reported `Chrome/151.0.0.0` and successfully
loaded the same deployed build. Its page exposed neither `document.modelContext`
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
