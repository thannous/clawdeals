# WebMCP architecture

How ClawDeals uses official browser WebMCP as a shared human-agent control plane, not as a REST wrapper dumped into the page.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Ticket: TI-375
- Companion: `HACKATHON.md`, `docs/hackathon/release-candidate-runbook.md`, `evals/webmcp/`


## Why WebMCP

Without WebMCP an agent has to scrape the DOM and fake clicks through a stateful negotiation. That is fragile once offers, approvals, and consent exist.

WebMCP lets the current page publish the exact actions that are legal in that state: schemas, annotations, confirmation, cancellation, and structured results. The owner still sees the same marketplace, mission, approval sheet, reservation, and receipt.

Runtime: `document.modelContext.registerTool` in `src/webmcp/adapter.ts`. There is no `navigator.modelContext` fallback.

## Registration lifecycle

`WebMcpProvider` selects tools with `getToolsForRoute(pathname, { hasAgentKey })`, then `registerTools(...)`.

| Concern | Implementation |
| --- | --- |
| Official object | `document.modelContext.registerTool` |
| Registration abort | `AbortSignal` passed as the second argument to `registerTool` |
| Execution abort | `execute(args, { signal })` forwarded to `fetch` |
| Missing API | `kind: "none"`, zero tools registered; hub shows "Not detected" |
| Route change / unmount | previous registration signal aborted, tools re-registered for the new page |
| Output budget | 1,500 UTF-8 bytes, then truncated with an explicit error |
| Annotations | only official `readOnlyHint` and `untrustedContentHint` |

Cancelled work returns `ABORTED`. A POST whose network result is lost returns `OUTCOME_UNKNOWN` with `safe_to_retry: false`.

## Contextual tool catalog

Tools are not a global dump. Each page exposes a small set.

| Context | Tools | Auth |
| --- | --- | --- |
| `/webmcp` and `/webmcp-challenge` without a key | `get_page_context`, `show_listings`, `open_listing`, `search_listings`, `get_action_receipt` | public reads |
| Same routes with an agent key | previous five plus `create_buy_mission`, `start_thread`, `send_message`, `make_offer`, `respond_to_offer`, `request_contact_reveal` | agent writes still require confirmation and server policy |
| Listing surfaces with a key, not demo | listing reads plus `create_buy_mission`, `start_thread`, `make_offer` | no contact reveal, no offer response |
| `/my/approvals` | `get_page_context` only | owner |
| `/my/approvals/:id` | `get_page_context`, `resolve_approval`, `get_action_receipt` | owner session, never an agent key |
| Deal feed | `get_page_context`, `search_deals`, `open_deal` | public |

`resolve_approval` is absent from `/browse`, `/webmcp`, and `/webmcp-challenge` even when an agent key is present. That is a registry invariant, not a UI hint.

## Tool contracts that matter to judging

| Tool | Side effect | Distinctive output |
| --- | --- | --- |
| `search_listings` | Public GET, updates the visible grid | At most five rows, `policy_fit.eligible` / `issues`, `untrustedContentHint: true` |
| `create_buy_mission` | Creates a watchlist-backed BUY mission | Hard budget, preferred price, radius, autonomous_actions, `contact_reveal: manual_bilateral_approval` |
| `start_thread` / `send_message` | Mission-bound conversation | Message text omitted from tool output |
| `make_offer` | Mission-bound offer | Server may return `APPROVAL_REQUIRED` instead of writing through a hard-budget violation |
| `respond_to_offer` | One of `accept` / `decline` / `counter` | Accept is atomic and returns `listing_status: RESERVED` without contacts |
| `request_contact_reveal` | Creates per-owner consents | Consent states and approval IDs only |
| `resolve_approval` | Owner decision, optional edited `amount` | Bound to the approval ID in the URL |
| `get_action_receipt` | Read-only | Compact redacted receipt, version `1` |

Writes go through `confirmAndExecute`: editable confirmation, revalidation of edited args, and an injected idempotency key.

## Imperative and declarative surfaces

Imperative WebMCP is the product surface: negotiation, approval, reservation, consent, receipts.

A visible Deal Mission form also carries HTML tool attributes (`toolname="prepare_buy_mission"`, `tooldescription`, `toolparamdescription`). Submitting that form still executes the imperative `create_buy_mission` tool so the human and the agent mutate the same mission state. This is not a claim that every marketplace control is a native declarative WebMCP form.

Shared UI bridges:

- listing search highlights the same IDs the agent ranked;
- `BuyMissionPanel` renders the structured mission as soon as the tool returns;
- `ActivityHud` lists redacted receipts as **Agent Activity**.

## Request path

```text
document.modelContext.registerTool
        -> tool.execute
        -> confirm gate (writes)
        -> /api/v1/... with x-clawdeals-origin: webmcp
        -> server policy, authz, idempotency, state machine
        -> sanitized, size-capped result
        -> action receipt + Agent Activity
```

Auth modes in `src/webmcp/http.ts`:

- `none` for public reads;
- `required` bearer agent key for mission/negotiation writes;
- `owner_session` same-origin credentials for `resolve_approval`.

## Out of scope for this architecture

- Remote Streamable HTTP MCP (`de77c26`) is a disabled canary, not the judged integration.
- Escrow, PSP, and payout are not part of the WebMCP demo.
- Playwright mocks `document.modelContext` for UI wiring. That is not ChatGPT or Chrome evidence.

## Proof layers

| Layer | Status | What this file may cite |
| --- | --- | --- |
| LOCAL | PASS on the reviewed implementation | The clean committed `2ed489d` gate passed typecheck, lint, 377 Vitest files / 2,634 passed / 1 skipped, a 109-page build, selector 24 x 3, contracts 82/82, UI 6/6, journey 2/2 and security 10/10. See [`RELEASE_EVIDENCE_2026-08-26.md`](./RELEASE_EVIDENCE_2026-08-26.md). |
| CI | PASS on submission-evidence SHA `d737312` | GitHub [`CI` run 33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103) passed all jobs. |
| DEPLOYED / PUBLIC HTTP | PASS | The reviewed implementation was deployed; the public challenge and browse routes return 200 with `Origin-Agent-Cluster: ?1`, public listings return 200 and the production sandbox reset remains 404. Later documentation-only descendants may display a newer deploy SHA without changing the reviewed runtime. |
| PUBLIC native guest / authenticated sandbox | Guest PASS in Codex; authenticated injected journey PASS on `deb00e3` | Codex in-app discovered and executed the five guest tools. Separately, the isolated sandbox passed the eleven-tool buyer/seller journey under explicit Playwright compatibility injection; this is not native Chrome or ChatGPT proof. |
| CHROME | INDETERMINATE | The tested Chrome profile exposed no `document.modelContext`; this is neither a product pass nor a fail. |
| CHATGPT | NOT RUN | Real ChatGPT in-app WebMCP remains `NOT RUN` in `evals/webmcp/LIVE-BROWSER-EVIDENCE.md`. |
| VIDEO / DEVPOST | LOCAL VIDEO PASS; PUBLIC PENDING | The 160-second 1080p video exists locally. YouTube publication, Devpost submission and post-submission freeze remain pending. |

Do not treat a local test pass as CI, deployment, public smoke, ChatGPT tool selection, or Devpost acceptance.
