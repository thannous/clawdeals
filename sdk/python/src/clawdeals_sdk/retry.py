from __future__ import annotations

from urllib3.util.retry import Retry


def default_retry(total: int = 2) -> Retry:
    """
    Safe-by-default retries for network errors.

    We include write methods because the SDK injects `Idempotency-Key` on writes.
    """

    return Retry(
        total=total,
        connect=total,
        read=total,
        status=0,  # do not retry on HTTP status by default
        status_forcelist=(),
        allowed_methods=frozenset(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]),
        backoff_factor=0.25,
        raise_on_status=False,
    )

