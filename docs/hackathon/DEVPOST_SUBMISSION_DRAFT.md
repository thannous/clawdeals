# Devpost submission draft — ClawDeals

Status: **DRAFT ONLY — not saved to Devpost and not submitted.**

Observed Devpost project: `Clawdeals Copilot`, draft `3/5`, submission ID
`1153777`. The current remote story is stale and must be replaced only after the
remaining public links are ready.

Live dashboard recheck on 26 August 2026 confirmed:

- project overview currently says `Clawdeals Copilot` with the pitch
  `A human and an AI agent share the same live marketplace page via WebMCP.`;
- project details still claim a `navigator` fallback and only a draft-listing
  write path;
- the demo URL still points to `https://clawdeals.com/webmcp`;
- the public repository URL is correct;
- the YouTube field is empty;
- submitter `Individual`, country `France`, app status `Existing`, learning
  `Significant` and career value `Yes` are already selected;
- no Devpost field was changed during this recheck.

## Action-time update package — prepared, not saved

Project overview:

- name: `ClawDeals`;
- elevator pitch: `Your agent negotiates. You stay in control.`

Project details:

- replace the remote story with **Project story** below;
- built-with tags: `webmcp`, `next.js`, `typescript`, `react`, `supabase`,
  `postgresql`, `vercel`, `cloudflare`, `vitest`, `playwright`;
- replace the demo URL with `https://clawdeals.com/webmcp-challenge`;
- keep `https://github.com/thannous/clawdeals`;
- add the challenge ledger and `HACKATHON.md` links listed under **Try it out**;
- add the public YouTube URL only after signed-out verification.

Additional information:

- keep `Individual`, `France` and `Existing`;
- describe the challenge-period delta using **What we built during the
  challenge** below;
- live URL: `https://clawdeals.com/webmcp-challenge`;
- public repo: `https://github.com/thannous/clawdeals`;
- tested clients: `Codex in-app browser — native guest WebMCP PASS; Chrome 151
  — runtime unavailable, recorded as INDETERMINATE; ChatGPT in-app — NOT RUN`;
- AI tools used: `OpenAI Codex, ChatGPT and Grok 4.6`;
- keep learning `Significant` and career value `Yes`.

Judge credentials remain blank until the isolated public sandbox is deployed
and verified. Its Supabase, Redis, masked secrets, DNS and TLS infrastructure now
exists, but the Vercel project still has no Git deployment. Saving Devpost
fields, publishing the video, accepting the rules and submitting are external
actions that require action-time confirmation.

## Project story

### Inspiration

Most shopping agents either guess a website's DOM or bypass the human through a
backend integration. ClawDeals asks a harder question: how can two agents search
and negotiate a real second-hand deal while their owners keep control of budget,
identity, contact details and final approval?

WebMCP gave us the missing in-page contract. The agent can use structured tools,
while the human watches the same marketplace page change and remains the final
authority for sensitive actions.

### What it does

ClawDeals is a trust layer for delegated commerce. A buyer can define a Deal
Mission with a preferred price, a hard budget, a radius and product requirements.
The agent searches and ranks listings with an explicit `policy_fit`, opens the
best candidate, starts a negotiation, asks structured questions and prepares an
offer.

Sensitive steps do not happen silently:

- owner policies are enforced again on the server;
- write tools stop for an editable confirmation;
- an amount above the mission's hard budget becomes `APPROVAL_REQUIRED`;
- offer acceptance reserves the listing atomically;
- contact details stay redacted until both owners consent;
- every action produces a compact receipt with a request ID, policy decision,
  confirmation state, input hash and redacted result.

The live judge page exposes five public read-only WebMCP tools. In a connected
in-app browser, those tools were discovered directly from the deployed page and
executed as `get_page_context` → `search_listings` → `get_action_receipt`; the
shared UI navigated to the filtered listings view and the receipt preserved all
redactions.

An authenticated isolated sandbox expands the contextual registry to eleven
tools for the full mission and negotiation workflow. Production intentionally
keeps the synthetic reset and mutation journey disabled.

### How we built it

The application is a Next.js Pages Router product written in TypeScript and
React. WebMCP tools register through the official
`document.modelContext.registerTool(tool, { signal })` lifecycle. The registry
changes with the page and authentication state, so an agent receives only the
tools that are useful and allowed in the current human context.

The tools reuse the same APIs and policy engine as the visible product. Vitest
contracts cover schemas, policy enforcement, confirmation and redaction.
Playwright runs deterministic UI and PostgreSQL-backed sandbox journeys with
synthetic Paris e-bike fixtures. Adversarial evals test prompt injection,
over-budget offers, replay, forged identity, unauthorized approvals and contact
leakage.

The public app is deployed through Vercel and routed through Cloudflare. The
repository records local, CI, deployed and public evidence separately so a
passing mock or HTTP response is never presented as native browser proof.

### What we built during the challenge

ClawDeals existed before 25 August 2026. The entry is therefore an **Existing
project**. Only the challenge-period extension is submitted for judging:

- the official imperative WebMCP runtime and contextual registry;
- the shared human-agent marketplace UI;
- Deal Mission and `policy_fit` ranking;
- mission-bound structured negotiation;
- editable owner approval and server-side hard-budget enforcement;
- atomic offer reservation;
- bilateral contact consent;
- Agent Activity and redacted audit receipts;
- the deterministic judge hub, synthetic fixtures and adversarial eval suite;
- reproducible release, security and public evidence documentation.

The public repository includes a baseline tag and a dated challenge ledger so
judges can inspect the exact delta.

### Challenges we ran into

The hardest part was not tool registration. It was preserving the trust boundary
when an agent can call the same business operations as a human. A confirmation
modal alone was not enough: policy had to be enforced on the server, approvals
had to be owner-only, writes had to be idempotent and contact reveal had to wait
for two independent consents.

We also had to keep proof layers honest. A mocked `document.modelContext` proves
wiring, not native browser execution. A production HTTP 200 proves deployment,
not a safe mutation journey. We built separate gates and evidence for each layer.

### Accomplishments that we are proud of

- A real deployed WebMCP read path selected and executed by an in-app agent.
- Eleven narrowly scoped authenticated tools instead of one omnipotent tool.
- Human-editable confirmation plus non-bypassable server policy.
- Deterministic negotiation fixtures that demonstrate both approval and denial.
- Redacted receipts that make agent actions inspectable without leaking secrets.
- A sub-three-minute 1080p demo with English captions and audio.

### What we learned

Agent-native commerce needs three contracts at once: a tool contract for the
agent, a policy contract for the platform and a consent contract for the human.
WebMCP makes the first contract visible inside the page; the other two determine
whether the result is trustworthy.

### What's next

Before final submission we will attach the public demo video and finish the
dedicated authenticated sandbox, which remains isolated from production data.
Judges can use ChatGPT's in-app browser or Chrome 149+ with
`chrome://flags/#enable-webmcp-testing`, as specified by the official rules; an
Origin Trial token is not required. After submission, the judged commit and site
will be frozen except for an explicitly documented blocking fix.

## Built with

Recommended tags:

`webmcp`, `next.js`, `typescript`, `react`, `supabase`, `postgresql`, `vercel`,
`cloudflare`, `vitest`, `playwright`

## Try it out links

1. Live judge hub: https://clawdeals.com/webmcp-challenge
2. Public repository: https://github.com/thannous/clawdeals
3. Challenge-period ledger:
   https://github.com/thannous/clawdeals/blob/main/docs/hackathon/WHAT_CHANGED.md
4. Reproduction and evidence:
   https://github.com/thannous/clawdeals/blob/main/HACKATHON.md

Testing instructions:

1. Open the live judge hub in ChatGPT's in-app browser, or in Chrome 149+ after
   enabling `chrome://flags/#enable-webmcp-testing` and restarting Chrome.
2. Visit `https://clawdeals.com/webmcp-challenge` for the public guest tools.
3. Authenticated sandbox credentials and the isolated mutation journey will be
   added only after signed-out verification of `sandbox.clawdeals.com`.

## Video demo link

`PENDING — public YouTube URL must be verified without authentication.`

Local video proof:
[`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md).

## Finalization checklist

- [x] Explicit judge instruction for ChatGPT in-app and the supported Chrome
  149+ flag is included; Origin Trial is not treated as a required gate.
- [ ] Public sandbox credentials/instructions are safe, synthetic and verified
  in a private window.
- [ ] YouTube video is public, has audio and is shorter than three minutes.
- [ ] Replace the stale Devpost story with the exact Markdown above.
- [ ] Replace the demo URL `/webmcp` with `/webmcp-challenge`.
- [ ] Add the final public video URL.
- [ ] Preview every Devpost section and link.
- [ ] Ask the user for action-time confirmation before final Submit.
- [ ] Record the submitted URL and timestamp, then freeze the judged commit.
