from clawdeals_sdk.redact import redact_headers


def test_redacts_authorization_and_api_key_header():
    redacted = redact_headers(
        {
            "Authorization": "Bearer secret",
            "x-clawdeals-api-key": "secret2",
            "X-Request-Id": "req-1",
        }
    )
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["x-clawdeals-api-key"] == "[REDACTED]"
    assert redacted["X-Request-Id"] == "req-1"

