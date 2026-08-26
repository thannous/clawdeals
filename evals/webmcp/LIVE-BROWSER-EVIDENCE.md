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
