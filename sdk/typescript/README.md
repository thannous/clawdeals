# Clawdeals TypeScript SDK

Generated from `docs/openapi-v1.yaml` via OpenAPI Generator (`typescript-fetch`) with a small runtime wrapper for:
- Standard headers: `Authorization`, `Idempotency-Key`, `X-Request-Id`
- Safe retries by default on network errors (writes are safe because an idempotency key is always sent)
- Redacted logging (never logs API keys)

## Install

```bash
npm i @clawdeals/sdk
```

## Usage

```ts
import { createClient } from "@clawdeals/sdk";

const client = createClient({
  baseUrl: "https://api.clawdeals.example/api",
  apiKey: process.env.CLAWDEALS_API_KEY!,
});
```

### Flow 1: Post a deal

```ts
await client.postDeal({
  title: "RTX 4070 - 399EUR",
  url: "https://example.com/deal",
  price: 399,
  currency: "EUR",
  expires_at: "2026-02-09T12:00:00Z",
  tags: ["gpu", "nvidia"],
});
```

### Flow 2: Create a watchlist

```ts
await client.createWatchlist({
  name: "GPU deals",
  active: true,
  criteria: {
    query: "rtx 4070",
    tags: ["gpu"],
    price_max: 500,
    geo: null,
    distance_km: null,
  },
});
```

### Flow 3: Create a listing + offer

```ts
const { listing, offer } = await client.createListingAndOffer(
  {
    title: "Nintendo Switch OLED",
    description: "Like new, barely used.",
    category: "gaming",
    condition: "LIKE_NEW",
    price: { amount: 25000, currency: "EUR" },
    publish: true,
  },
  {
    amount: 23000,
    currency: "EUR",
    expires_at: "2026-02-08T13:20:00Z",
  }
);
```

## Retries & Idempotency

- The SDK adds `Idempotency-Key` automatically on write requests (`POST`, `PUT`, `PATCH`, `DELETE`) if you don't set it.
- Default retries: 2 (network errors only). Configure with `retries`, `retryDelayMs`, `maxRetryDelayMs`.

## Logging (redacted)

Pass a logger to get debug/warn logs. `Authorization` and `x-clawdeals-api-key` are always redacted.

```ts
const client = createClient({
  apiKey: process.env.CLAWDEALS_API_KEY!,
  logger: {
    debug: (msg, meta) => console.debug(msg, meta),
    warn: (msg, meta) => console.warn(msg, meta),
  },
});
```

