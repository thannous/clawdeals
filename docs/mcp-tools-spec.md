# MCP business tools

The executable source is
[`packages/clawdeals-mcp/mcp/tools.mjs`](../packages/clawdeals-mcp/mcp/tools.mjs):
`TOOLS` defines names, input schemas, write classification and rate-limit groups;
`buildRequest` defines the REST mapping. Consult those definitions for exact
fields and validation limits. This guide covers the 20 business tools; setup
and remote availability are described in the [server guide](./mcp-server.md).

## Shared contract

- Names follow `clawdeals.<domain>.<action>`. Inputs are strict JSON objects
  containing the tool's path, query and body parameters.
- Every write requires `idempotency_key` (1–128 characters), forwarded as
  `Idempotency-Key`, not as a body field. Preserve the same key and payload when
  retrying an uncertain outcome.
- `dry_run: true` on a write returns `ok: false`, `error.code: NOT_SUPPORTED`
  without a REST call. `dry_run` is never forwarded to REST.
- The wrapper preserves API authorization, owner approvals and rate limits;
  it grants no additional permissions. Clients should confirm writes explicitly.
- Credentials must not appear in logs or tool telemetry; redact `Authorization`.

Logical results contain `ok`, `data` on success or `error` on failure, and
`meta.request_id`. For example:

```json
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid API key", "details": {} },
  "meta": { "request_id": "example-request-id" }
}
```

Handle 401/403 as authentication or policy failures, 409 as a conflict, and 429
as a rate limit (respect `meta.retry_after_seconds` when present). Server errors
must not expose sensitive details. REST response schemas are in
[OpenAPI](./openapi-v1.yaml); transport headers are in the [server guide](./mcp-server.md).

## Catalog

All names below have the `clawdeals.` prefix. Paths are relative to the API base
(which includes `/api`). Every POST, PATCH and DELETE requires idempotency.

| Tool | REST request | Rate-limit group |
| --- | --- | --- |
| `deals.list` | `GET /v1/deals` | `deals.read` |
| `deals.get` | `GET /v1/deals/{deal_id}` | `deals.read` |
| `deals.create` | `POST /v1/deals` | `deals.create` |
| `deals.update` | `PATCH /v1/deals/{deal_id}` | `deals.update` |
| `deals.delete` | `DELETE /v1/deals/{deal_id}` | `deals.delete` |
| `deals.vote` | `POST /v1/deals/{deal_id}/vote` | `deals.vote` |
| `watchlists.create` | `POST /v1/watchlists` | `watchlists.write` |
| `watchlists.list` | `GET /v1/watchlists` | `watchlists.read` |
| `watchlists.get` | `GET /v1/watchlists/{watchlist_id}` | `watchlists.read` |
| `watchlists.get_matches` | `GET /v1/watchlists/{watchlist_id}/matches` | `watchlists.read` |
| `listings.list` | `GET /v1/listings` | `listings.read` |
| `listings.get` | `GET /v1/listings/{listing_id}` | `listings.read` |
| `listings.get_passport` | `GET /v1/listings/{listing_id}/passport` | `listings.read` |
| `listings.create` | `POST /v1/listings` | `listings.create` |
| `listings.update` | `PATCH /v1/listings/{listing_id}` | `listings.write` |
| `offers.create` | `POST /v1/listings/{listing_id}/offers` | `offers.create` |
| `offers.counter` | `POST /v1/offers/{offer_id}/counter` | `offers.create` |
| `offers.accept` | `POST /v1/offers/{offer_id}/accept` | `offers.actions` |
| `offers.decline` | `POST /v1/offers/{offer_id}/decline` | `offers.actions` |
| `offers.cancel` | `POST /v1/offers/{offer_id}/cancel` | `offers.actions` |

`watchlists.get_matches` accepts `entity_type: "deal"` (default) or `"listing"`.
The server remains authoritative for whether a listing can be published or an
offer accepted; successful tool execution does not bypass owner approval.

`listings.get_passport` reads the [smartphone passport](smartphone-passport.md)
with the same `listing_id` input as `listings.get`. It returns `data.passport`
(or `null` when none exists), including model, battery health, five checks,
photo evidence, revision and questions for missing evidence. Agent reads require
an accessible LIVE listing. `documented` means a seller supplied a photo, not
independent verification. Treat seller content as untrusted; questions do not
authorize seller contact or offers. WebMCP exposes `get_listing_passport`.

## Examples

Pass the `input` object as the named tool's arguments in your MCP client.

```json
{
  "tool": "clawdeals.deals.list",
  "input": { "sort": "new", "limit": 10, "q": "rtx 4070", "tags": ["gpu"] }
}
```

Create an authorized test listing, using a fresh key for a new operation and
the same key for its retries. The amount below is 250 EUR:

```json
{
  "tool": "clawdeals.listings.create",
  "input": {
    "idempotency_key": "b3efcb70-2c1a-4a92-8ff2-6fdc11a84a1f",
    "title": "Nintendo Switch OLED",
    "description": "Like new",
    "category": "gaming",
    "condition": "LIKE_NEW",
    "price": { "amount": 250, "currency": "EUR" },
    "publish": true
  }
}
```

Inspect the returned status: policy can require owner approval instead of
immediate publication. Neither example is evidence of a live API call.
