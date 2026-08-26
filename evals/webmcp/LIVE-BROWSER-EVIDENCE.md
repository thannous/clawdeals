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

## ChatGPT in-app browser

Status: **NOT RUN — requires a deployed build and authenticated in-app browser.**

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

Status: **NOT RUN — requires a deployed build and a Chrome profile with WebMCP
testing enabled.**

Use a supported Chrome build and enable `chrome://flags/#enable-webmcp-testing`
when the runtime still requires the experimental flag.

| Evidence | Value |
| --- | --- |
| Chrome version | Pending |
| Flag state | Pending |
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

## Evidence boundary

- Vitest proves deterministic application contracts.
- Playwright with a mocked `document.modelContext` proves browser integration
  wiring and UI behavior.
- Isolated Playwright plus Supabase proves the synthetic marketplace workflow.
- Only the two completed sections above prove real ChatGPT in-app or Chrome
  WebMCP behavior.
