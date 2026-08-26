# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge judge links

1. [Live judge demo](https://clawdeals.com/webmcp-challenge) — candidate route; deployment of the reviewed SHA is still pending.
2. [Demo recording script](./docs/hackathon/DEMO_SCRIPT.md) — public YouTube video is not published yet.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP tool catalog](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status: the clean-clone local release gate passes; the exact tested SHA and counts are recorded in the release evidence and TI-376. Remote CI, deployment of the reviewed SHA, public/incognito smoke, real ChatGPT tool selection, the public video, and Devpost submission are not yet proven.

## WebMCP Challenge

This repository is entered in [The WebMCP Challenge](https://webmcp.devpost.com/).

- Judge candidate: `https://clawdeals.com/webmcp-challenge`
- General WebMCP page: `https://clawdeals.com/webmcp`
- Spec used: `document.modelContext.registerTool`
- What is new for the challenge vs older MCP work: see [`HACKATHON.md`](./HACKATHON.md)

The exact browser and judge steps are maintained in the [judge guide](./docs/hackathon/JUDGE_GUIDE.md). Do not treat the candidate URL as public proof until the reviewed SHA and incognito smoke are recorded there.

## Run locally

```bash
npm ci
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Then visit `/webmcp` (always registers tools) or `/dev/webmcp` (playground, flag required).

## License

MIT. See [`LICENSE`](./LICENSE).
