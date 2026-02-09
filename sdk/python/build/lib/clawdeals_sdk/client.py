from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Optional

from clawdeals_sdk_generated import ApiClient as GeneratedApiClient
from clawdeals_sdk_generated import Configuration
from clawdeals_sdk_generated.api.deals_api import DealsApi
from clawdeals_sdk_generated.api.listings_api import ListingsApi
from clawdeals_sdk_generated.api.offers_api import OffersApi
from clawdeals_sdk_generated.api.watchlists_api import WatchlistsApi
from clawdeals_sdk_generated.models.deal_create_request_v1 import DealCreateRequestV1
from clawdeals_sdk_generated.models.listing_create_request_v1 import ListingCreateRequestV1
from clawdeals_sdk_generated.models.offer_create_request_v1 import OfferCreateRequestV1
from clawdeals_sdk_generated.models.watchlist_create_request_v1 import WatchlistCreateRequestV1

from .redact import redact_headers
from .retry import default_retry

LoggerFn = Callable[[str, Any], None]


def _is_write(method: str) -> bool:
    m = method.upper()
    return m in ("POST", "PUT", "PATCH", "DELETE")


class ApiClient(GeneratedApiClient):
    """
    Wrapper around the OpenAPI-generated ApiClient that injects:
    - `X-Request-Id` for tracing
    - `Idempotency-Key` for write safety (required by the API contract)

    And never logs secrets (redacted headers).
    """

    def __init__(
        self,
        configuration: Configuration,
        *,
        logger_debug: Optional[LoggerFn] = None,
        logger_warn: Optional[LoggerFn] = None,
    ) -> None:
        super().__init__(configuration=configuration)
        self._logger_debug = logger_debug
        self._logger_warn = logger_warn
        self.user_agent = "clawdeals-sdk-python/0.1.0"

    def call_api(  # type: ignore[override]
        self,
        method,
        url,
        header_params=None,
        body=None,
        post_params=None,
        _request_timeout=None,
    ):
        header_params = header_params or {}

        # Always include a request id for correlation.
        header_params.setdefault("X-Request-Id", str(uuid.uuid4()))

        # Ensure write requests are idempotent.
        if _is_write(method):
            header_params.setdefault("Idempotency-Key", str(uuid.uuid4()))

        self._logger_debug and self._logger_debug(
            "clawdeals-sdk:request",
            {"method": method, "url": url, "headers": redact_headers(header_params)},
        )

        try:
            return super().call_api(
                method,
                url,
                header_params=header_params,
                body=body,
                post_params=post_params,
                _request_timeout=_request_timeout,
            )
        except Exception as e:
            self._logger_warn and self._logger_warn(
                "clawdeals-sdk:error",
                {"method": method, "url": url, "error": str(e)},
            )
            raise


@dataclass(frozen=True)
class Client:
    api_client: ApiClient
    deals: DealsApi
    watchlists: WatchlistsApi
    listings: ListingsApi
    offers: OffersApi

    def post_deal(self, body: DealCreateRequestV1, *, idempotency_key: Optional[str] = None):
        return self.deals.v1_deals_create(body, idempotency_key=idempotency_key)

    def create_watchlist(self, body: WatchlistCreateRequestV1, *, idempotency_key: Optional[str] = None):
        return self.watchlists.v1_watchlists_create(body, idempotency_key=idempotency_key)

    def create_listing(self, body: ListingCreateRequestV1, *, idempotency_key: Optional[str] = None):
        return self.listings.v1_listings_create(body, idempotency_key=idempotency_key)

    def create_offer(
        self,
        listing_id: str | uuid.UUID,
        body: OfferCreateRequestV1,
        *,
        idempotency_key: Optional[str] = None,
    ):
        lid = listing_id if isinstance(listing_id, uuid.UUID) else uuid.UUID(listing_id)
        return self.offers.v1_offers_create(lid, body, idempotency_key=idempotency_key)

    def create_listing_and_offer(
        self,
        listing: ListingCreateRequestV1,
        offer: OfferCreateRequestV1,
        *,
        listing_idempotency_key: Optional[str] = None,
        offer_idempotency_key: Optional[str] = None,
    ):
        created_listing = self.create_listing(listing, idempotency_key=listing_idempotency_key)
        created_offer = self.create_offer(created_listing.listing_id, offer, idempotency_key=offer_idempotency_key)
        return {"listing": created_listing, "offer": created_offer}


def create_client(
    *,
    base_url: str = "https://api.clawdeals.example/api",
    api_key: Optional[str] = None,
    api_key_header: Optional[str] = None,
    retries: int = 2,
    logger_debug: Optional[LoggerFn] = None,
    logger_warn: Optional[LoggerFn] = None,
) -> Client:
    cfg = Configuration(host=base_url)
    if api_key:
        cfg.access_token = api_key
    if api_key_header:
        cfg.api_key["apiKeyHeaderAuth"] = api_key_header

    # Retry on network errors only (no status retries by default).
    cfg.retries = default_retry(total=retries)

    api_client = ApiClient(cfg, logger_debug=logger_debug, logger_warn=logger_warn)

    return Client(
        api_client=api_client,
        deals=DealsApi(api_client),
        watchlists=WatchlistsApi(api_client),
        listings=ListingsApi(api_client),
        offers=OffersApi(api_client),
    )
