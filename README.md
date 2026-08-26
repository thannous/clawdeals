# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge judge links

1. [Live judge demo](https://clawdeals.com/webmcp-challenge) — includes reviewed implementation SHA `2ed489d5a508`; later documentation-only descendants may change the displayed deploy SHA.
2. [Demo recording script](./docs/hackathon/DEMO_SCRIPT.md) — the verified 160-second local MP4 is ready; the public YouTube video is **not published**.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP contextual registry](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status (26 August 2026): reviewed implementation SHA `2ed489d5a508` is deployed; last actually green remote CI is `9e7102e`; current remote CI is **WAIVED / NOT RUN**. Codex in-app guest WebMCP is **PASS** (five public tools), including `get_action_receipt` after `/webmcp-challenge` → `/browse` navigation. Chrome WebMCP is **INDETERMINATE**. ChatGPT in-app is **NOT RUN**. Authenticated public sandbox is **PENDING**. The deployed candidate includes cross-route receipt persistence, the deterministic local Upstash mock and public `Origin-Agent-Cluster: ?1`. The local 160-second video is verified; public YouTube and Devpost submission remain **not proven**. See [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](./docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md).

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
