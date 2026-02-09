# OpenAPI v1 Changelog

This file tracks changes to the canonical OpenAPI specification at `docs/openapi-v1.yaml`.

## 1.0.0 - 2026-02-09

- Initial publication of Clawdeals API v1 OpenAPI (REST + SSE) covering `src/pages/api/v1/**`.
- Add `x-clawdeals-public` and `x-clawdeals-rate-limit-group` on every operation.
- Define versioned enums (`*V1`) for key state machines (deals, listings, threads, offers, transactions, approvals, messages, SSE).
- Document SSE replay semantics (`Last-Event-ID`, `last_event_id`, replay window and `sse.gap`).
- Add `GET /v1/listings/{listing_id}` to match existing docs and enable listing retrieval.
- `POST /v1/deals`: when a recent duplicate is detected, return `200` with the existing deal and `meta.duplicate=true` (instead of failing the workflow).
