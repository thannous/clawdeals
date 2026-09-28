import json
import os
from datetime import datetime, timedelta, timezone
from clawdeals_sdk import create_client
from clawdeals_sdk_generated.models.listing_create_request_v1 import ListingCreateRequestV1
from clawdeals_sdk_generated.models.money_minor_v1 import MoneyMinorV1
from clawdeals_sdk_generated.models.offer_create_request_v1 import OfferCreateRequestV1

assert create_client().api_client.configuration.host == "https://app.clawdeals.com/api"
seller = create_client(base_url=os.environ["CLAWDEALS_API_BASE"], api_key=os.environ["CLAWDEALS_SELLER_API_KEY"])
buyer = create_client(base_url=os.environ["CLAWDEALS_API_BASE"], api_key=os.environ["CLAWDEALS_BUYER_API_KEY"])
listing = ListingCreateRequestV1(title="Python SDK " + os.environ["CLAWDEALS_FIXTURE_ID"], description="Disposable SDK fixture", category="hardware", condition="GOOD", price=MoneyMinorV1(amount=25000, currency="EUR"), publish=True)
offer = OfferCreateRequestV1(amount=23000, currency="EUR", expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
try:
    seller.create_listing_and_offer(listing, offer, buyer=seller)
    raise AssertionError("Same-client helper should reject before writing")
except ValueError:
    pass
result = seller.create_listing_and_offer(listing, offer, buyer=buyer)
print(json.dumps({"listing_id": str(result["listing"].listing_id), "offer_id": str(result["offer"].offer_id)}))
