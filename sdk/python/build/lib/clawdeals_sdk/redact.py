SENSITIVE_HEADER_KEYS = {
  "authorization",
  "x-clawdeals-api-key",
}


def redact_headers(headers: dict | None) -> dict:
    if not headers:
        return {}

    out = {}
    for k, v in headers.items():
        key = str(k)
        if key.lower() in SENSITIVE_HEADER_KEYS:
            out[key] = "[REDACTED]"
        else:
            out[key] = v
    return out
