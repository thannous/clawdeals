# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge judge links

1. [Live judge demo](https://clawdeals.com/webmcp-challenge) — includes reviewed runtime `fc29e6659d5a`; the page reports its exact deployment descendant.
2. [Demo recording script](./docs/hackathon/DEMO_SCRIPT.md) — the historical 160-second MP4 must be regenerated locally; the public YouTube video is **not published**.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP contextual registry](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status (27 August 2026): reviewed runtime candidate `fc29e6659d5a` passes preflight, typecheck, lint, 381 Vitest files / 2,667 tests / 1 skipped, a 109-page build, selector 24 × 3, contracts 82/82 and UI 6/6; later documentation-only descendants do not change that runtime proof. Database journey/security are not yet rerun on that SHA. Reviewed implementation `2ed489d5a508` remains the separately proven deployed/public candidate; last actually green remote CI is `9e7102e`, and current remote CI is **WAIVED / NOT RUN**. Codex in-app guest WebMCP is **PASS** on the deployed candidate. The authenticated sandbox has isolated Supabase and Vercel foundations but no Redis, secrets, deployment or DNS, so its eleven-tool journey is still **PENDING**. Chrome is **INDETERMINATE**, ChatGPT in-app is **NOT RUN**, and public YouTube/Devpost remain **not proven**. See [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](./docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md) and [`docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md`](./docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md).

## WebMCP Challenge

This repository is entered in [The WebMCP Challenge](https://webmcp.devpost.com/).

- Judge candidate: `https://clawdeals.com/webmcp-challenge`
- General WebMCP page: `https://clawdeals.com/webmcp`
- Spec used: `document.modelContext.registerTool`
- What is new for the challenge vs older MCP work: see [`HACKATHON.md`](./HACKATHON.md)

The exact browser and judge steps are maintained in the [judge guide](./docs/hackathon/JUDGE_GUIDE.md). Public HTTP and Codex guest discovery are recorded; they do not prove Chrome native WebMCP, ChatGPT in-app selection, an authenticated sandbox journey, a public video, or Devpost submission.

## Run locally

```bash
npm ci
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Then visit `/webmcp` (always registers tools) or `/dev/webmcp` (playground, flag required).

## License

MIT. See [`LICENSE`](./LICENSE).
