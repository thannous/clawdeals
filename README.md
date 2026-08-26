# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge judge links

1. [Live judge demo](https://clawdeals.com/webmcp-challenge) — deployed and publicly reachable on the reviewed implementation SHA.
2. [Demo recording script](./docs/hackathon/DEMO_SCRIPT.md) — public YouTube video is not published yet.
3. [Judge guide](./docs/hackathon/JUDGE_GUIDE.md)
4. [What was built during the challenge](./docs/hackathon/WHAT_CHANGED.md)
5. [WebMCP tool catalog](./docs/hackathon/WEBMCP_ARCHITECTURE.md#contextual-tool-catalog)
6. [Evals](./docs/hackathon/EVALS.md) and [security model](./docs/hackathon/SECURITY_MODEL.md)

Proof status: the clean-clone release gate, [`CI`](https://github.com/thannous/clawdeals/actions/runs/32959645029), [`SDK CI`](https://github.com/thannous/clawdeals/actions/runs/32959645020), Vercel deployment, and public HTTP route checks pass for implementation SHA `3f10575`. The full private-window journey, real ChatGPT tool selection on this candidate, the public video, and Devpost submission remain pending. See [`docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md`](./docs/hackathon/RELEASE_EVIDENCE_2026-08-26.md).

## WebMCP Challenge

This repository is entered in [The WebMCP Challenge](https://webmcp.devpost.com/).

- Judge candidate: `https://clawdeals.com/webmcp-challenge`
- General WebMCP page: `https://clawdeals.com/webmcp`
- Spec used: `document.modelContext.registerTool`
- What is new for the challenge vs older MCP work: see [`HACKATHON.md`](./HACKATHON.md)

The exact browser and judge steps are maintained in the [judge guide](./docs/hackathon/JUDGE_GUIDE.md). Public HTTP proof is recorded; do not treat it as proof of the still-pending private-window WebMCP journey.

## Run locally

```bash
npm ci
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Then visit `/webmcp` (always registers tools) or `/dev/webmcp` (playground, flag required).

## License

MIT. See [`LICENSE`](./LICENSE).
