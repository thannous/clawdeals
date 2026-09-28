# WebMCP validation

Updated 2026-09-28 after the unit-test cleanup. This is a map of available checks, not a current pass report or a mandatory release gate.

## Choose a layer

| Behavior | Existing evidence entrypoint |
| --- | --- |
| Browser registry, locale navigation, copyable mission | `e2e/ui/webmcp-challenge.spec.ts` |
| Confirmation and contextual tool execution | `e2e/ui/webmcp.spec.ts` |
| Mission → offer → agreement → receipt | `e2e/integration/webmcp-submission-journey.spec.ts` |
| Deterministic local reset fixtures | `e2e/integration/sandbox-ebike-fixtures.spec.ts` |
| Synthetic seller responses | `e2e/integration/sandbox-seller-autopilot.spec.ts` |
| Owner authorization, acceptance, consent and redaction | `eval:webmcp:security` in `package.json` |
| Focused registry, HTTP, redaction and output contracts | `eval:webmcp:contracts` in `package.json` |
| Deterministic reference planner | `reference-selection.cases.json`, `scripts/evaluate-webmcp-selection.mjs` |

The [security matrix](./SECURITY-MATRIX.md) maps the retained authorization coverage. Test existence is not proof that it passed on the current commit.

## Commands

```bash
npm run eval:webmcp:selection
npm run eval:webmcp:contracts
npm run eval:webmcp:ui
npm run eval:webmcp:journey
npm run eval:webmcp:security
```

Run only the checks relevant to a change. `npm run eval:webmcp:gate` aggregates these with lint, typecheck, unit tests and a build; it is an optional broad validation command, not a requirement for every edit.

The database journeys use sandbox-only fixtures. Their current guards require a non-production database even though the owner authorizes ordinary tests on fictitious production data. The deleted hosted sandbox is not available. See [environment policy](../../docs/release-environments.md) and [local fixtures](../../docs/sandbox-getting-started.md).

## Evidence boundaries

- Playwright's injected `document.modelContext` checks application behavior, not native browser WebMCP support.
- The reference planner is deterministic, not an LLM. Its recorded results do not establish ChatGPT tool selection or the current result of a changed corpus.
- Record native browser support separately with runtime/version and tested revision.
- Keep each E2E result's exact command, target, prerequisites and report/trace. Old event reports and deleted test files are not current evidence.

Recompute the reference planner without changing its archive with `npm run eval:webmcp:selection`; update the archive only when intended with `npm run eval:webmcp:selection:update`.
