# WebMCP Dev Notes (Clawdeals)

## Enable / Kill Switch

WebMCP is **disabled by default**.

Enable it locally / on staging by setting:

```bash
export NEXT_PUBLIC_WEBMCP_ENABLED=1
```

Kill switch: unset it (or set to `0`).

## Capability Detection

The app will only register tools when `navigator.modelContext` exists and exposes a compatible registration API.
If unsupported, it is a no-op (no console errors expected).

## Where Tools Register

To keep this v0 surface tight, tools only register after you visit:

- `/developer/*`
- `/dev/webmcp`

## Chrome Early Preview

If you are using a Chrome/WebMCP early preview build:

1. Enable the WebMCP flag(s) in `chrome://flags` (exact names may vary by build).
2. Install/open the WebMCP inspector extension (if required by the build).
3. Visit `/dev/webmcp` and verify tools appear.

## Quick Verification

1. Start the app with `NEXT_PUBLIC_WEBMCP_ENABLED=1`
2. Visit `/dev/webmcp`
3. In the page header, confirm:
   - `SUPPORTED: YES`
   - `REGISTERED: YES`
4. Run `clawdeals.deals_search` with `{ "limit": 1 }`
5. Run `clawdeals.listings_create_draft` and verify the confirm modal blocks writes until approved.

