# WebMCP Challenge — Clawdeals Copilot

Hackathon: [The WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI, 25 Aug–3 Sep 2026)

Clawdeals already existed as an agent marketplace with REST, a server MCP, and a v0 in-browser tool pack. **Only the WebMCP work added after 25 August 2026 is in scope for judging.**

## New work (submission period)

- Register tools on the official `document.modelContext.registerTool` API (navigator kept as fallback).
- AbortSignal lifecycle so tools unregister on navigation.
- Collaboration tools that update the **same UI the human is looking at**:
  - `get_page_context`
  - `search_listings` / `search_deals`
  - `show_listings`
  - `open_listing` / `open_deal`
- Public, unauthenticated reads against `/api/v1/public/listings` and `/api/v1/public/deals`.
- Marketplace surfaces (`/webmcp`, `/browse`, `/browse/deals`) register tools without a feature flag.
- Agent activity HUD + listing/deal highlight so the human sees what the agent just did.
- Writes still go through the existing confirmation modal (`clawdeals.listings_create_draft`, `clawdeals.approvals_resolve`).

## Prior work (not judged)

- Server MCP / skill pack
- Original `/dev/webmcp` playground
- REST tools `clawdeals.*` that wrapped authenticated APIs without UI updates
- Trust score, approvals, escrow, listings, deals product

## How to test

1. Open `https://clawdeals.com/webmcp` in ChatGPT’s in-app browser or Chrome 149+ with WebMCP enabled.
2. Prompt: `Find used electronics under 200 EUR and highlight them on this page.`
3. Confirm the grid filters and cards highlight.
4. Prompt: `Open the first listing.`
5. Optional write path: issue an agent key at `/start`, then `Create a draft listing titled "WebMCP demo lamp" for 25 EUR.` Approve or deny the modal.

Reads work with no account. Writes require an agent API key from `/start` plus human confirmation.

## Implementation

Tools register from `src/webmcp/WebMcpProvider.tsx` via `src/webmcp/adapter.ts`:

```js
await document.modelContext.registerTool({
  name: "search_listings",
  description: "Search the public marketplace and update the listings grid",
  inputSchema: { /* ... */ },
  execute: async (input) => { /* ... */ }
});
```
