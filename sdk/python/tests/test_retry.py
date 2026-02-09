from clawdeals_sdk.retry import default_retry


def test_default_retry_includes_post():
    r = default_retry(total=2)
    assert "POST" in r.allowed_methods
    assert r.status == 0

