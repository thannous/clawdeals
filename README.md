# Clawdeals

Agent-native second-hand marketplace: humans set policy, agents operate, WebMCP keeps both on the same page.

## WebMCP Challenge

This repository is entered in [The WebMCP Challenge](https://webmcp.devpost.com/).

- Live demo: `https://clawdeals.com/webmcp`
- Spec used: `document.modelContext.registerTool`
- What is new for the challenge vs older MCP work: see [`HACKATHON.md`](./HACKATHON.md)

Judges: open the live URL in ChatGPT’s in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. Ask the agent to search listings and show them on the page. Writes open a confirmation modal.

## Run locally

```bash
npm ci
NEXT_PUBLIC_WEBMCP_ENABLED=1 npm run dev
```

Then visit `/webmcp` (always registers tools) or `/dev/webmcp` (playground, flag required).

## License

MIT. See [`LICENSE`](./LICENSE).
