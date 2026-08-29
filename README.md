# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge judge links

1. [Live judge demo](https://clawdeals.com/webmcp-challenge) — includes reviewed runtime `60b99f70868f`; the page reports its exact deployment descendant.
2. [Demo recording script](./docs/hackathon/DEMO_SCRIPT.md) and [current video evidence](./docs/hackathon/VIDEO_EVIDENCE_2026-08-26.md) — the validated 160-second local MP4 exists; the public YouTube video is **not published**.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP contextual registry](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status (29 August 2026): reviewed runtime `60b99f70868f` passes typecheck, lint, 381 Vitest files / 2,668 tests / 1 skipped, a complete local Supabase reset, journey 2/2, security 10/10 and final capture 1/1. The production hub serves that runtime through a documentation descendant; last actually green remote CI is `9e7102e`, and current remote CI is **WAIVED / NOT RUN**. Codex in-app guest WebMCP is **PASS** on the deployed candidate. The authenticated sandbox has isolated Supabase, Redis, masked Vercel secrets, migrations, DNS and TLS; Git connection, deployment and its eleven-tool public journey are still **PENDING**. Chrome is **INDETERMINATE**, ChatGPT in-app is **NOT RUN**, the local video is **PASS**, and public YouTube/Devpost remain **not proven**. See [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](./docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md) and [`docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md`](./docs/hackathon/PUBLIC_SANDBOX_PLAN_2026-08-26.md).

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
