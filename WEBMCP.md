# WebMCP (In-Browser Tools) — Clawdeals

Clawdeals registers in-page tools on `document.modelContext` so an agent can act on the **same live marketplace UI** a human is looking at.

## Surfaces

| Route | Registers tools | Notes |
|---|---|---|
| `/webmcp` | always | Judge / demo copilot |
| `/browse`, `/browse/deals`, `/marketplace` | always | Product UI updates |
| `/dev/webmcp` | `NEXT_PUBLIC_WEBMCP_ENABLED=1` | Local invoke playground |

## Tools

Collaboration (guest-readable, update UI):

- `get_page_context`
- `search_listings` / `search_deals`
- `show_listings`
- `open_listing` / `open_deal`

REST-compatible (same confirm/redaction path as v0):

- `clawdeals.deals_search` / `clawdeals.deals_get`
- `clawdeals.listings_search` / `clawdeals.listings_get`
- `clawdeals.approvals_list` / `clawdeals.approvals_get`
- `clawdeals.listings_create_draft` (confirm, DRAFT only)
- `clawdeals.approvals_resolve` (confirm)

## Safety

- Write/admin tools require the confirmation modal.
- Outputs are sanitized and capped at 16KB.
- Requests send `X-Client-Channel: webmcp`.
- Public search tools do not require an API key.
- Authenticated writes still require the key from `/start`.
