# Live WebMCP browser evidence

ChatGPT in-app browsing and Chrome WebMCP are separate proof layers. A Playwright
mock of `document.modelContext` cannot satisfy either layer.

## Shared judge scenario

1. Open the deployed `/webmcp-challenge` URL in a clean browser profile.
2. Confirm that the hub reports native `document.modelContext` support.
3. Without a key, record the exact five registered public tools.
4. Connect the judge agent, reset the synthetic data, and record the exact eleven
   authenticated tools.
5. Paste the copyable Paris e-bike mission from the hub.
6. Record the first selected tool and the tool sequence.
7. Approve the mission and the compliant offer; deny one protected action.
8. Record the agreement receipt ID and verify that no API key, email address,
   phone number, or raw contact data appears in the model output.

Do not enter real contact data. Use only the deterministic judge fixture.

## Public incognito smoke (stock Chromium)

Status: **PASS for read-only production smoke; native WebMCP INDETERMINATE.**

At `2026-08-26T14:20:20.016Z`, a fresh Playwright Chromium context opened
`https://clawdeals.com/webmcp-challenge` with no cookies, storage state or agent
key. The page returned 200 and displayed deployed SHA `1b52e64799fd`; public
listings returned 200 and `GET /api/v1/sandbox/reset` returned 404. Stock
Chromium exposed no `document.modelContext`, so it registered no native tools.

A separate clean context with an explicit test `document.modelContext`
injection observed the exact five guest tools on the deployed JavaScript. That
is registration-wiring evidence only and does not complete either native table
below. Full evidence: `docs/hackathon/PUBLIC_SMOKE_2026-08-26.md`.

## Codex in-app browser

Status: **PASS for native public discovery and read-only execution on
`2ed489d5a508`; authenticated journey PENDING.**

At `2026-08-26T17:21Z`, the connected Codex in-app browser discovered the
five public tools directly from `https://clawdeals.com/webmcp-challenge`. It
executed `get_page_context`, `search_listings` and `get_action_receipt`. The
search updated the shared UI to `/browse?q=e-bike`; Agent Activity recorded the
successful policy decision and redacted coordinates. Native discovery on
`/browse` still returned the same five tools, so the receipt was read without
returning to the hub. Request IDs were
`8d6975ba-279d-4c42-aaad-914225764fd0` for context,
`ec572532-5994-4145-96e9-2095d592e666` for search and
`df16a0fb-2cc6-4619-9989-12fcb652a802` for receipt retrieval. The receipt
contained no keys, tokens or contact data.

This is native in-app WebMCP evidence, but the selected runtime identified
itself as **Codex In-app Browser**. Keep the ChatGPT row below separate. Full
payload evidence and boundaries:
`docs/hackathon/NATIVE_WEBMCP_EVIDENCE_2026-08-26.md`.

## ChatGPT in-app browser

Status: **NOT RUN — the Codex in-app proof above does not establish ChatGPT's
separate in-app runtime.**

| Evidence | Value |
| --- | --- |
| Tested URL | Pending |
| Build commit | Pending |
| Test date/time (UTC) | Pending |
| Native WebMCP supported | Pending |
| Public/authenticated registry | Pending |
| First selected tool | Pending |
| Full sequence | Pending |
| Confirmation approve/deny | Pending |
| Receipt ID | Pending |
| PII/secret scan | Pending |
| Video/screenshot artifact | Pending |

If the in-app browser does not expose WebMCP, record **INDETERMINATE** with the
observed capability result. Do not convert lack of access into a pass or fail.

## Chrome WebMCP

Status: **INDETERMINATE — Chrome 151 loaded the deployed build, but its WebMCP
runtime was not active.**

Use a supported Chrome build and enable `chrome://flags/#enable-webmcp-testing`
when the runtime still requires the experimental flag.

| Evidence | Value |
| --- | --- |
| Chrome version | `151.0.0.0` |
| Flag state | Not inspectable through the managed browser; no setting changed |
| Tested URL | `https://clawdeals.com/webmcp-challenge` |
| Build commit | `9e7102ea4dcc879aa1f5ffb4e68bb712cf11c96e` |
| Test date/time (UTC) | `2026-08-26T14:39Z` |
| Native WebMCP supported | INDETERMINATE — `document.modelContext` absent in this profile |
| Public/authenticated registry | Pending |
| First selected tool | Pending |
| Full sequence | Pending |
| Confirmation approve/deny | Pending |
| Receipt ID | Pending |
| PII/secret scan | Pending |
| Video/screenshot artifact | None retained; textual browser state recorded |

## Evidence boundary

- Vitest proves deterministic application contracts.
- Playwright with a mocked `document.modelContext` proves browser integration
  wiring and UI behavior.
- Isolated Playwright plus Supabase proves the synthetic marketplace workflow.
- Only the completed Codex section proves native in-app WebMCP behavior here.
  ChatGPT is not run and Chrome remains indeterminate.
