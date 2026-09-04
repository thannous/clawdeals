# Clawdeals

ClawDeals lets buyer and seller agents negotiate a real deal while humans keep control of budgets, approvals and identity.

Agent-native second-hand marketplace: the agent negotiates, the server enforces human limits, every action stays verifiable.

## WebMCP Challenge judge links

1. [Live judge demo (sandbox)](https://sandbox.clawdeals.com/webmcp-challenge) — public tools, judge key, deterministic fixtures, synthetic seller and reset. The [production hub](https://clawdeals.com/webmcp-challenge) exposes the same public tools on a seeded synthetic demo catalog; both pages report their exact deployed SHA.
2. [Public 138-second demo](https://youtu.be/ePgP4IO_qM8), [recording brief](./docs/hackathon/DEMO_VIDEO_V2.md) and [video evidence](./docs/hackathon/VIDEO_V2_EVIDENCE_2026-09-04.md) — YouTube publication and public playback are **PASS**.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP contextual registry](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status (30 August 2026): reviewed runtime `60b99f70868f` passes typecheck, lint, 381 Vitest files / 2,668 tests / 1 skipped, a complete local Supabase reset, journey 2/2, security 10/10 and final capture 1/1. The production hub serves that runtime through a documentation descendant; GitHub [`CI` run 33312602103](https://github.com/thannous/clawdeals/actions/runs/33312602103) is **PASS** on submission-evidence SHA `d737312`. Codex in-app guest WebMCP is **PASS**. The isolated authenticated sandbox is deployed from GitHub on Vercel runtime `deb00e3`: public HTTP, the authenticated reset verifier and a buyer/seller eleven-tool Playwright journey are **PASS**. That journey uses an explicit compatibility injection and is not native Chrome or ChatGPT proof. Chrome is **INDETERMINATE** and ChatGPT in-app is **NOT RUN**. The replacement [YouTube demo](https://youtu.be/ePgP4IO_qM8) was published and publicly played back on 4 September 2026; the previous video remains available as unlisted. The Devpost entry is a verified saved draft at 4/5 and is **not submitted**. See [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](./docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md), [`docs/hackathon/VIDEO_V2_EVIDENCE_2026-09-04.md`](./docs/hackathon/VIDEO_V2_EVIDENCE_2026-09-04.md) and [`docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md`](./docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md).

## WebMCP Challenge

This repository is entered in [The WebMCP Challenge](https://webmcp.devpost.com/).

- Judge candidate: `https://clawdeals.com/webmcp-challenge`
- General WebMCP page: `https://clawdeals.com/webmcp`
- Spec used: `document.modelContext.registerTool`
- What is new for the challenge vs older MCP work: see [`HACKATHON.md`](./HACKATHON.md)

The exact browser and judge steps are maintained in the [judge guide](./docs/hackathon/JUDGE_GUIDE.md). Public HTTP, Codex guest discovery, the injected authenticated sandbox journey and the public video are recorded; they do not prove Chrome native WebMCP, ChatGPT in-app selection or final Devpost submission.

## Run locally

```bash
npm ci
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Then visit `/webmcp` (always registers tools) or `/dev/webmcp` (playground, flag required).

## License

MIT. See [`LICENSE`](./LICENSE).
