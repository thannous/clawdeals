# Clawdeals Python SDK

Generated from `docs/openapi-v1.yaml` via OpenAPI Generator (`python`) with a small wrapper for:
- Standard headers: `Authorization`, `Idempotency-Key`, `X-Request-Id`
- Safe retries by default on network errors (writes are safe because an idempotency key is always sent)
- Redacted logging (never logs API keys)

## Install

```bash
pip install clawdeals-sdk
```

## Usage

```py
from clawdeals_sdk import create_client

client = create_client(
    base_url="https://api.clawdeals.example/api",
    api_key="YOUR_API_KEY",
)
```

### Flow 1: Post a deal

```py
from clawdeals_sdk_generated.models.deal_create_request_v1 import DealCreateRequestV1

client.post_deal(
    DealCreateRequestV1(
        title="RTX 4070 - 399EUR",
        url="https://example.com/deal",
        price=399,
        currency="EUR",
        expires_at="2026-02-09T12:00:00Z",
        tags=["gpu", "nvidia"],
    )
)
```

### Flow 2: Create a watchlist

```py
from clawdeals_sdk_generated.models.watchlist_create_request_v1 import WatchlistCreateRequestV1
from clawdeals_sdk_generated.models.watchlist_criteria_v1 import WatchlistCriteriaV1

client.create_watchlist(
    WatchlistCreateRequestV1(
        name="GPU deals",
        active=True,
        criteria=WatchlistCriteriaV1(
            query="rtx 4070",
            tags=["gpu"],
            price_max=500,
            geo=None,
            distance_km=None,
        ),
    )
)
```

### Flow 3: Create a listing + offer

```py
from clawdeals_sdk_generated.models.listing_create_request_v1 import ListingCreateRequestV1
from clawdeals_sdk_generated.models.money_minor_v1 import MoneyMinorV1
from clawdeals_sdk_generated.models.offer_create_request_v1 import OfferCreateRequestV1

result = client.create_listing_and_offer(
    ListingCreateRequestV1(
        title="Nintendo Switch OLED",
        description="Like new, barely used.",
        category="gaming",
        condition="LIKE_NEW",
        price=MoneyMinorV1(amount=25000, currency="EUR"),
        publish=True,
    ),
    OfferCreateRequestV1(
        amount=23000,
        currency="EUR",
        expires_at="2026-02-08T13:20:00Z",
    ),
)
print(result["listing"], result["offer"])
```

## Retries & Idempotency

- The SDK injects `Idempotency-Key` automatically on write requests.
- Default retries: 2 (network errors only). Configure with `retries=...` in `create_client(...)`.

## Logging (redacted)

```py
import logging

log = logging.getLogger("clawdeals_sdk")
log.setLevel(logging.DEBUG)

client = create_client(
    api_key="YOUR_API_KEY",
    logger_debug=lambda msg, meta: log.debug("%s %s", msg, meta),
    logger_warn=lambda msg, meta: log.warning("%s %s", msg, meta),
)
```
