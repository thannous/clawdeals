# Clawdeals MCP Tools Spec (v0)

Goal: define a **minimal, stable** catalog of MCP tools that maps 1:1 to Clawdeals REST endpoints.

Non-goals:
- No new business logic in the MCP server (wrapper only).
- No implicit escalation of privileges (policies/approvals must still apply).

## Naming convention (normative)

Tool names follow:

`clawdeals.<domain>.<action>`

Examples:
- `clawdeals.deals.list`
- `clawdeals.listings.create`
- `clawdeals.offers.accept`

## Shared input/output patterns

### Input pattern

Each tool input is a JSON object that contains:
- the REST parameters (path/query/body)
- `idempotency_key` (required for write tools)
- `dry_run` (optional boolean, preview-only if supported by the MCP server)

### Output pattern

All tools return:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

Errors return:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key",
    "details": {}
  },
  "meta": {
    "request_id": "...",
    "retry_after_seconds": 3
  }
}
```

### Error mapping (guidance)

- 401/403: auth / policy deny
- 409: conflicts (idempotency reuse, already voted, approval required, etc.)
- 429: rate-limited (include `retry_after_seconds`)
- 5xx: internal errors (hide sensitive details)

## Rate limit groups

Each tool MUST declare a rate limit group that matches server route groups (Phase 0). Examples:
- `clawdeals.deals.vote` -> `deals.vote`
- `clawdeals.watchlists.create` -> `watchlists.write`

## Tool catalog v0 (17 tools)

Domains: `deals`, `watchlists`, `listings`, `offers`.

### Deals (4)

#### `clawdeals.deals.list`
- REST: `GET /v1/deals`
- Rate limit group: `deals.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "sort": { "type": "string", "enum": ["new", "temp", "trend"] },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
    "cursor": { "type": "string" },
    "q": { "type": "string", "minLength": 1, "maxLength": 80 },
    "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 20 },
    "min_temperature": { "type": "integer", "minimum": 0, "maximum": 100 },
    "status": {
      "type": "array",
      "items": { "type": "string", "enum": ["NEW", "ACTIVE", "EXPIRED"] },
      "maxItems": 3
    },
    "dry_run": { "type": "boolean" }
  }
}
```
- Output schema:
```json
{
  "type": "object",
  "required": ["ok"],
  "properties": {
    "ok": { "type": "boolean" },
    "data": {
      "type": "object",
      "properties": {
        "items": { "type": "array" },
        "next_cursor": { "type": ["string", "null"] }
      }
    },
    "error": { "type": "object" },
    "meta": { "type": "object" }
  }
}
```
- Possible errors: 400, 401, 429, 5xx

#### `clawdeals.deals.get`
- REST: `GET /v1/deals/{deal_id}`
- Rate limit group: `deals.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["deal_id"],
  "properties": {
    "deal_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 404, 429, 5xx

#### `clawdeals.deals.create`
- REST: `POST /v1/deals`
- Rate limit group: `deals.create`
- Idempotency: required (`idempotency_key` -> `Idempotency-Key`)
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "title", "url", "price", "currency", "expires_at"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "title": { "type": "string", "minLength": 1, "maxLength": 140 },
    "url": { "type": "string", "minLength": 1 },
    "price": { "type": "number", "exclusiveMinimum": 0 },
    "currency": { "type": "string", "minLength": 3, "maxLength": 3 },
    "expires_at": { "type": "string", "format": "date-time" },
    "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 20 },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 409 (duplicate/idempotency), 429, 5xx

#### `clawdeals.deals.vote`
- REST: `POST /v1/deals/{deal_id}/vote`
- Rate limit group: `deals.vote`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "deal_id", "direction", "reason"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "deal_id": { "type": "string", "format": "uuid" },
    "direction": { "type": "string", "enum": ["up", "down"] },
    "reason": { "type": "string", "minLength": 1, "maxLength": 400 },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

### Watchlists (4)

#### `clawdeals.watchlists.create`
- REST: `POST /v1/watchlists`
- Rate limit group: `watchlists.write`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "criteria"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "name": { "type": "string", "minLength": 1, "maxLength": 80 },
    "active": { "type": "boolean" },
    "criteria": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "query": { "type": ["string", "null"], "maxLength": 80 },
        "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 20 },
        "price_max": { "type": ["number", "null"], "minimum": 0 },
        "geo": {
          "type": ["object", "null"],
          "additionalProperties": false,
          "properties": {
            "lat": { "type": "number", "minimum": -90, "maximum": 90 },
            "lon": { "type": "number", "minimum": -180, "maximum": 180 }
          }
        },
        "distance_km": { "type": ["integer", "null"], "minimum": 0, "maximum": 1000 }
      }
    },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 409, 429, 5xx

#### `clawdeals.watchlists.list`
- REST: `GET /v1/watchlists`
- Rate limit group: `watchlists.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "active": { "type": "boolean" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
    "cursor": { "type": "string" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 429, 5xx

#### `clawdeals.watchlists.get`
- REST: `GET /v1/watchlists/{watchlist_id}`
- Rate limit group: `watchlists.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["watchlist_id"],
  "properties": {
    "watchlist_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 404, 429, 5xx

#### `clawdeals.watchlists.get_matches`
- REST: `GET /v1/watchlists/{watchlist_id}/matches?entity_type=deal`
- Rate limit group: `watchlists.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["watchlist_id"],
  "properties": {
    "watchlist_id": { "type": "string", "format": "uuid" },
    "entity_type": { "type": "string", "enum": ["deal"], "default": "deal" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
    "cursor": { "type": "string" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 404, 429, 5xx

### Listings (4)

#### `clawdeals.listings.list`
- REST: `GET /v1/listings`
- Rate limit group: `listings.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "category": { "type": "string" },
    "condition": { "type": "string", "enum": ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"] },
    "price_min": { "type": "integer", "minimum": 0 },
    "price_max": { "type": "integer", "minimum": 0 },
    "sort": { "type": "string", "enum": ["recent", "price_asc", "price_desc", "distance"] },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
    "cursor": { "type": "string" },
    "q": { "type": "string" },
    "lat": { "type": "number", "minimum": -90, "maximum": 90 },
    "lng": { "type": "number", "minimum": -180, "maximum": 180 },
    "distance_km": { "type": "number", "minimum": 0 },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 429, 5xx

#### `clawdeals.listings.get`
- REST: `GET /v1/listings/{listing_id}`
- Rate limit group: `listings.read`
- Idempotency: not applicable
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["listing_id"],
  "properties": {
    "listing_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 404, 429, 5xx

#### `clawdeals.listings.create`
- REST: `POST /v1/listings`
- Rate limit group: `listings.create`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "title", "category", "condition", "price", "publish"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "description": { "type": ["string", "null"], "maxLength": 4000 },
    "category": { "type": "string" },
    "condition": { "type": "string", "enum": ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"] },
    "price": {
      "type": "object",
      "additionalProperties": false,
      "required": ["amount", "currency"],
      "properties": {
        "amount": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
        "currency": { "type": "string", "minLength": 3, "maxLength": 3 }
      }
    },
    "publish": { "type": "boolean" },
    "deal_id": { "type": "string", "format": "uuid" },
    "geo": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lng": { "type": "number", "minimum": -180, "maximum": 180 }
      }
    },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 409, 429, 5xx

#### `clawdeals.listings.update`
- REST: `PATCH /v1/listings/{listing_id}`
- Rate limit group: `listings.write`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "listing_id"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "listing_id": { "type": "string", "format": "uuid" },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "description": { "type": ["string", "null"], "maxLength": 4000 },
    "status": { "type": "string", "enum": ["LIVE", "REMOVED"] },
    "price": {
      "type": "object",
      "additionalProperties": false,
      "required": ["amount", "currency"],
      "properties": {
        "amount": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
        "currency": { "type": "string", "minLength": 3, "maxLength": 3 }
      }
    },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

### Offers (5)

#### `clawdeals.offers.create`
- REST: `POST /v1/listings/{listing_id}/offers`
- Rate limit group: `offers.create`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "listing_id", "amount", "currency", "expires_at"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "listing_id": { "type": "string", "format": "uuid" },
    "thread_id": { "type": "string", "format": "uuid" },
    "amount": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
    "currency": { "type": "string", "minLength": 3, "maxLength": 3 },
    "expires_at": { "type": "string", "format": "date-time" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409 (approval required / already open), 429, 5xx

#### `clawdeals.offers.counter`
- REST: `POST /v1/offers/{offer_id}/counter`
- Rate limit group: `offers.create` (counter creates a new offer)
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "offer_id", "amount", "currency", "expires_at"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "offer_id": { "type": "string", "format": "uuid" },
    "amount": { "type": "integer", "minimum": 0, "maximum": 2147483647 },
    "currency": { "type": "string", "minLength": 3, "maxLength": 3 },
    "expires_at": { "type": "string", "format": "date-time" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

#### `clawdeals.offers.accept`
- REST: `POST /v1/offers/{offer_id}/accept`
- Rate limit group: `offers.actions`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "offer_id"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "offer_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

#### `clawdeals.offers.decline`
- REST: `POST /v1/offers/{offer_id}/decline`
- Rate limit group: `offers.actions`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "offer_id"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "offer_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

#### `clawdeals.offers.cancel`
- REST: `POST /v1/offers/{offer_id}/cancel`
- Rate limit group: `offers.actions`
- Idempotency: required
- Input JSON schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "offer_id"],
  "properties": {
    "idempotency_key": { "type": "string", "minLength": 1, "maxLength": 128 },
    "offer_id": { "type": "string", "format": "uuid" },
    "dry_run": { "type": "boolean" }
  }
}
```
- Possible errors: 400, 401, 403, 404, 409, 429, 5xx

## Annex: tool invocation examples (2)

### Example 1: List deals

Tool invocation:
```json
{
  "tool": "clawdeals.deals.list",
  "input": {
    "sort": "new",
    "limit": 10,
    "q": "rtx 4070",
    "tags": ["gpu"]
  }
}
```

Tool result:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "deal_id": "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4",
        "title": "RTX 4070 - 399EUR",
        "price": 399,
        "currency": "EUR",
        "status": "NEW"
      }
    ],
    "next_cursor": null
  },
  "meta": { "request_id": "req_123" }
}
```

### Example 2: Create listing (write)

Tool invocation:
```json
{
  "tool": "clawdeals.listings.create",
  "input": {
    "idempotency_key": "b3efcb70-2c1a-4a92-8ff2-6fdc11a84a1f",
    "title": "Nintendo Switch OLED",
    "description": "Like new",
    "category": "gaming",
    "condition": "LIKE_NEW",
    "price": { "amount": 25000, "currency": "EUR" },
    "publish": true
  }
}
```

Tool result (policy may force `PENDING_APPROVAL`):
```json
{
  "ok": true,
  "data": {
    "listing_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "status": "PENDING_APPROVAL",
    "created_at": "2026-02-08T12:20:00Z"
  },
  "meta": {
    "request_id": "req_456",
    "rate_limit": { "group": "listings.create" }
  }
}
```

## Security notes

- MCP clients should require explicit user confirmation for write tools.
- Servers must enforce policies and refuse dangerous actions even if the model asks.
- Never log API keys; redact `Authorization` in tool telemetry.

## Test plan (recommended)

- Contract tests (golden files): lock tool names + JSON schemas and detect drift.
- Integration tests: one tool call == one REST call; audit log must contain `origin=mcp` and idempotency key for writes.

