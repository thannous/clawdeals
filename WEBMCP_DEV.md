# WebMCP Dev Notes (Clawdeals)

## Demo (always on)

`/webmcp` registers tools whenever `document.modelContext` (or `navigator.modelContext`) exists.

## Playground

`/dev/webmcp` requires:

```bash
export NEXT_PUBLIC_WEBMCP_ENABLED=1
```

## Chrome

1. Chrome 149+
2. Enable `chrome://flags/#enable-webmcp-testing`
3. Relaunch
4. Visit `/webmcp`
5. Confirm supported and registered on `/webmcp` or `/dev/webmcp`

## ChatGPT

Open the same URL in the ChatGPT desktop in-app browser. Site tools appear in the address bar.

## Verify a write

1. Visit `/start` and store an agent API key
2. On `/dev/webmcp`, run `clawdeals.listings_create_draft`
3. Deny, then approve
4. Confirm the modal blocks the POST until Approve, and the request has `Idempotency-Key`
