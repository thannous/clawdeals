# WebMCP security matrix

Updated 2026-09-28: this matrix maps security invariants to retained test entrypoints, not a current execution result.
It distinguishes native WebMCP tool execution from REST invariants that the
server revalidates for those tools.

| Invariant | Expected result | Automated evidence | Layer |
| --- | --- | --- | --- |
| Public listing search without key | Success; read only | `src/webmcp/http.test.ts`, `src/webmcp/tools/collab-tools.test.ts` | WebMCP contract |
| Approval resolution on browse | Tool absent | `src/webmcp/tools/index.test.ts` | Registry/authz |
| Approval by agent or foreign owner | Refused | `e2e/integration/mission-owner-approval.spec.ts` | Server authz |
| Same idempotency key and payload | One outcome | `e2e/integration/webmcp-submission-journey.spec.ts`, `e2e/integration/offer-actions.spec.ts` | WebMCP + server |
| Same key with a different payload | `IDEMPOTENCY_KEY_REUSE` | idempotency middleware tests and integration coverage | Server invariant |
| Two concurrent accepted offers | One reservation, no deadlock | `e2e/integration/offer-actions.spec.ts`, `supabase/migrations/20260826170000_ti_377_offer_accept_lock_order.sql` | Atomic server invariant |
| One contact consent | No contact reveal | `e2e/integration/contact-reveal.spec.ts` | Server invariant |
| Bilateral contact consent | Counterparty-only reveal | `e2e/integration/contact-reveal.spec.ts` | Server invariant |
| Listing prompt injection | Remains untrusted data; no write | `src/webmcp/tools/collab-tools.test.ts` | WebMCP contract |
| Aborted invocation | `ABORTED`; request signal forwarded | `src/webmcp/adapter.test.ts`, `src/webmcp/http.test.ts`, `src/webmcp/confirm/gate.test.ts` | WebMCP contract |
| Ambiguous write response | `OUTCOME_UNKNOWN`, `safe_to_retry: false` | `src/webmcp/http.test.ts`, `src/webmcp/activity/action-receipts.test.ts` | WebMCP contract |
| Tool output size | At most 1,500 UTF-8 bytes | `src/webmcp/security/output-cap.test.ts`, isolated submission journey | WebMCP contract |
| Secret and PII output | Redacted; UUID workflow IDs preserved | `src/webmcp/security/sanitize.test.ts`, `src/webmcp/activity/action-receipts.test.ts`, isolated submission journey | WebMCP contract |
| Mission to agreement to receipt | Reproducible on clean synthetic data | `e2e/integration/webmcp-submission-journey.spec.ts` | WebMCP + isolated DB |
| Judge reset and synthetic seller turn outside the sandbox | `404`; fail-closed on a production database target; `403` for non-judge agents | `src/__tests__/pages-api/v1/sandbox/reset.test.ts`, `src/__tests__/pages-api/v1/sandbox/seller-turn.test.ts`, `e2e/integration/sandbox-ebike-fixtures.spec.ts` | Server authz |
| Synthetic seller turn | Counters below 1,250 EUR at 1,350 EUR (above the judge hard budget), accepts at or above, idempotent while its counter is open | `e2e/integration/sandbox-seller-autopilot.spec.ts` | Sandbox-only server logic |
| Edited confirmation | Human-edited amount is what gets approved; Escape and overlay never emit `USER_DENIED` | `src/webmcp/confirm/ConfirmModalHost.test.tsx`, `src/webmcp/confirm/summarize.test.ts` | WebMCP confirmation gate |

The natural-language selector corpus is a deterministic reference planner, not
a claim about ChatGPT's model behavior. Record native browser evidence separately for each tested runtime and revision.
