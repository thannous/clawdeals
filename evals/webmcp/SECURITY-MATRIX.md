# WebMCP submission security matrix

This matrix maps the challenge plan's section 14 cases to executable evidence.
It distinguishes native WebMCP tool execution from REST invariants that the
server revalidates for those tools.

| Invariant | Expected result | Automated evidence | Layer |
| --- | --- | --- | --- |
| Public listing search without key | Success; read only | `src/webmcp/http.test.ts`, `src/webmcp/tools/collab-tools.test.ts` | WebMCP contract |
| Approval resolution on browse | Tool absent | `src/webmcp/tools/index.test.ts` | Registry/authz |
| Approval by agent or foreign owner | Refused | `e2e/integration/mission-owner-approval.spec.ts` | Server authz |
| Same idempotency key and payload | One outcome | `e2e/integration/webmcp-submission-journey.spec.ts`, `e2e/integration/offer-actions.spec.ts` | WebMCP + server |
| Same key with a different payload | `IDEMPOTENCY_KEY_REUSE` | idempotency middleware tests and integration coverage | Server invariant |
| Two concurrent accepted offers | One reservation, no deadlock | `e2e/integration/offer-actions.spec.ts`, `supabase/migrations/20260826170000_ti_377_offer_accept_lock_order.sql`, `src/__tests__/migrations/ti-377-offer-accept-lock-order.test.ts` | Atomic server invariant |
| One contact consent | No contact reveal | `e2e/integration/contact-reveal.spec.ts` | Server invariant |
| Bilateral contact consent | Counterparty-only reveal | `e2e/integration/contact-reveal.spec.ts` | Server invariant |
| Listing prompt injection | Remains untrusted data; no write | `src/webmcp/tools/collab-tools.test.ts` | WebMCP contract |
| Aborted invocation | `ABORTED`; request signal forwarded | `src/webmcp/adapter.test.ts`, `src/webmcp/http.test.ts`, `src/webmcp/confirm/gate.test.ts` | WebMCP contract |
| Ambiguous write response | `OUTCOME_UNKNOWN`, `safe_to_retry: false` | `src/webmcp/http.test.ts`, `src/webmcp/activity/action-receipts.test.ts` | WebMCP contract |
| Tool output size | At most 1,500 UTF-8 bytes | `src/webmcp/security/output-cap.test.ts`, isolated submission journey | WebMCP contract |
| Secret and PII output | Redacted; UUID workflow IDs preserved | `src/webmcp/security/sanitize.test.ts`, `src/webmcp/activity/action-receipts.test.ts`, isolated submission journey | WebMCP contract |
| Mission to agreement to receipt | Reproducible on clean synthetic data | `e2e/integration/webmcp-submission-journey.spec.ts` | WebMCP + isolated DB |

The natural-language selector corpus is a deterministic reference planner, not
a claim about ChatGPT's model behavior. Real browser evidence belongs in
[`LIVE-BROWSER-EVIDENCE.md`](LIVE-BROWSER-EVIDENCE.md).
