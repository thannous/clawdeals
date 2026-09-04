# Devpost submission draft — ClawDeals

Status: **SAVED DRAFT 4/5 — verified on Devpost, not submitted.**

Observed Devpost project: `ClawDeals`, draft `4/5`, submission ID `1153777`,
slug `clawdeals`. The saved project preview was re-opened on 3 September 2026
and shows the current pitch, final story, public YouTube embed, three-image
gallery and the sandbox as the first **Try it out** link.

The saved remote draft now contains:

- project name `ClawDeals` and pitch `Your agent negotiates. You stay in control.`
  (the story now opens with the one-line pitch *ClawDeals lets buyer and seller
  agents negotiate a real deal while humans keep control of budgets, approvals
  and identity.*);
- the current trust-layer story and challenge-period delta;
- ten built-with tags and five judge/reproduction links;
- the public video `https://youtu.be/mjNd6BNk_0U`;
- the three prepared gallery images and the hero project thumbnail;
- `Individual`, `France`, `Existing`, learning `Significant` and career value `Yes`;
- private synthetic buyer/seller credentials in the judge-only instructions.

The Official Rules checkbox remains unchecked and `Submit project` was not
clicked. Final submission requires a separate confirmation.

The official event page currently requires a working live URL, a text
description, a public YouTube demo under three minutes with audio, and a public
repository with a detectable open-source license. Its judging criteria are
WebMCP Leverage, Execution, Potential Impact, and Creativity & Ambition. The
deadline displayed for Europe/Paris is 3 September 2026 at 22:00.

## Saved update package — not submitted

Project overview:

- name: `ClawDeals`;
- elevator pitch: `Your agent negotiates. You stay in control.`

Project details:

- replace the remote story with **Project story** below;
- built-with tags: `webmcp`, `next.js`, `typescript`, `react`, `supabase`,
  `postgresql`, `vercel`, `cloudflare`, `vitest`, `playwright`;
- **primary live/demo URL: `https://sandbox.clawdeals.com/webmcp-challenge`**
  (decision of 3 September: the sandbox hosts the five public tools, the eleven
  authenticated tools, the deterministic fixtures, the synthetic seller turn and
  the judge reset; the production hub `https://clawdeals.com/webmcp-challenge`
  stays listed second as the public marketplace with a seeded demo catalog);
- keep `https://github.com/thannous/clawdeals`;
- add the challenge ledger and `HACKATHON.md` links listed under **Try it out**;
- public YouTube URL: `https://youtu.be/mjNd6BNk_0U` (anonymous verification PASS).

Additional information:

- keep `Individual`, `France` and `Existing`;
- describe the challenge-period delta using **What we built during the
  challenge** below;
- live URL: `https://sandbox.clawdeals.com/webmcp-challenge` (production
  marketplace: `https://clawdeals.com/webmcp-challenge`);
- public repo: `https://github.com/thannous/clawdeals`;
- tested clients: `Codex in-app browser — native guest WebMCP PASS; isolated
  public sandbox — authenticated eleven-tool journey PASS under an explicit
  Playwright compatibility injection; Chrome 151 — native runtime and exact
  eleven-tool registry PASS after enabling the testing flag, but no
  Inspector-driven tool invocation/request ID was recorded; ChatGPT in-app —
  NOT RUN`;
- AI tools used: `OpenAI Codex, ChatGPT and Grok 4.6`;
- keep learning `Significant` and career value `Yes`.

The isolated public sandbox is deployed and verified at
`https://sandbox.clawdeals.com/webmcp-challenge`. Synthetic judge credentials
exist and passed the authenticated journey; they were supplied only through
Devpost's private judge-instructions field and remain absent from this file and
version control. Accepting the rules and submitting remain separate external
actions requiring action-time confirmation.

## Project story

ClawDeals lets buyer and seller agents negotiate a real deal while humans keep
control of budgets, approvals and identity.

1. **The agent negotiates.** It searches, ranks, asks the seller and prepares
   offers through page-scoped WebMCP tools.
2. **The server enforces human limits.** Hard budgets, owner-only approvals and
   bilateral consent are re-checked server-side; a confirmation modal is never
   the security boundary.
3. **Every action stays verifiable.** Each protected step leaves a redacted
   receipt with a request ID, an input hash and a policy decision.

### Inspiration

Shopping agents already search and fill carts. Real second-hand deals are
harder: two independent people, an asynchronous negotiation, a hard budget, and
contact details nobody wants leaked to a stranger's bot. WebMCP gave us the
missing in-page contract: the agent gets structured tools, the human keeps the
same page and the last word.

### Who this is for

Second-hand marketplaces between individuals — bikes, electronics, furniture —
where negotiation is asynchronous, scams and leaked contact details are the first
risk, and an agent without server-enforced limits is unusable. Beyond e-bikes,
the same primitives (mission, policy stop, atomic reservation, bilateral consent,
receipt) apply to housing, used cars and freelance work.

### What it does

A buyer defines a Deal Mission: preferred price, hard budget, radius,
requirements. The agent searches and ranks listings with an explicit
`policy_fit` — and the human sees the same verdict as a badge on each card —
opens the best candidate, starts a thread, asks structured questions and
prepares an offer. Every write stops for a human-readable confirmation where the
amount can be edited before approval.

Above the hard budget the server answers `APPROVAL_REQUIRED` instead of sending
the offer; only the owner page can resolve it. Acceptance reserves the listing
atomically. Contact details stay redacted until both owners consent. A live
checklist on the judge hub lights up each of these moments from the receipts.

Official contest samples cover catalogues and carts. ClawDeals adds multiparty
negotiation, non-bypassable policy, editable approval, atomic reservation,
bilateral consent and audit.

### How we built it

The application is a Next.js Pages Router product written in TypeScript and
React. WebMCP tools register through the official
`document.modelContext.registerTool(tool, { signal })` lifecycle. The registry
changes with the page and authentication state, so an agent receives only the
tools that are useful and allowed in the current human context. The judge hub
reads that registry back through `document.modelContext.getTools()` and
refreshes on `toolchange`, so judges see the browser's own view next to ours.

The live judge page exposes five public read-only WebMCP tools. In a connected
in-app browser, those tools were discovered directly from the deployed page and
executed as `get_page_context` → `search_listings` → `get_action_receipt`; the
shared UI navigated to the filtered listings view and the receipt preserved all
redactions. The authenticated isolated sandbox expands the contextual registry to
eleven tools for the full mission and negotiation workflow; production keeps the
synthetic reset and mutation journey disabled.

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

The public YouTube demo and isolated authenticated sandbox are live. The
sandbox remains available at
`https://sandbox.clawdeals.com/webmcp-challenge`; production reset stays closed.
Chrome 151 now exposes the native WebMCP runtime and the exact eleven-tool
authenticated registry after enabling the testing flag. An Inspector-driven
Chrome tool invocation with request IDs is still pending, and ChatGPT in-app
remains untested. Judges can use ChatGPT's in-app browser or Chrome 149+ with
`chrome://flags/#enable-webmcp-testing`, as specified by the official rules; an
Origin Trial token is not required. After submission, the judged commit and site
will be frozen except for an explicitly documented blocking fix.

## Built with

Recommended tags:

`webmcp`, `next.js`, `typescript`, `react`, `supabase`, `postgresql`, `vercel`,
`cloudflare`, `vitest`, `playwright`

## Try it out links

1. Live judge hub (sandbox — public tools, judge key, fixtures, synthetic
   seller, reset): https://sandbox.clawdeals.com/webmcp-challenge
2. Production marketplace (public tools on a seeded demo catalog):
   https://clawdeals.com/webmcp-challenge
3. Public repository: https://github.com/thannous/clawdeals
4. Challenge-period ledger:
   https://github.com/thannous/clawdeals/blob/main/docs/hackathon/WHAT_CHANGED.md
5. Reproduction and evidence:
   https://github.com/thannous/clawdeals/blob/main/HACKATHON.md

Testing instructions:

1. Open the live judge hub in ChatGPT's in-app browser, or in Chrome 149+ after
   enabling `chrome://flags/#enable-webmcp-testing` and restarting Chrome.
   In Chrome, install the official **WebMCP Model Context Tool Inspector** from
   the Chrome Web Store to inspect and invoke the registered tools without the
   developer console.
2. Visit `https://sandbox.clawdeals.com/webmcp-challenge`: the five public
   guest tools work without any key; paste the private judge key in the
   **Judge key** field to unlock the eleven authenticated tools, the reset and
   the synthetic seller turn.
3. `https://clawdeals.com/webmcp-challenge` is the production marketplace with
   the same public tools on a seeded synthetic demo catalog (33 listings, 10
   deals); production keeps the reset and the seller turn disabled.

### Private judge instructions — saved after credential-transmission confirmation

The following redacted template mirrors Devpost's saved private instructions.
The live field contains the synthetic credentials; this repository deliberately
retains placeholders only.

```text
Authenticated synthetic sandbox:
https://sandbox.clawdeals.com/webmcp-challenge

Buyer API key: <PRIVATE_SYNTHETIC_BUYER_KEY>
Seller API key: <PRIVATE_SYNTHETIC_SELLER_KEY>

1. Open the sandbox URL in ChatGPT's in-app browser, or in Chrome 149+ after
   enabling `chrome://flags/#enable-webmcp-testing` and restarting Chrome. In
   Chrome, install the official WebMCP Model Context Tool Inspector extension
   to inspect and invoke tools.
2. Paste the buyer key into the page's inline **Judge key** field and connect
   it; no developer console is needed. The authenticated registry should expose
   eleven contextual tools.
3. Use the page's Reset demo control before each run. Reset is intentionally
   available only on the isolated sandbox; production returns 404.
4. Run the copyable Deal Mission: Paris e-bike, preferred price 1,100 EUR,
   hard budget 1,300 EUR, radius 15 km.
5. Search policy-fit listings, open the target listing, start the negotiation,
   send a question and prepare an offer. The deterministic regression uses the
   target listing price of 1,150 EUR; both 1,100 and 1,150 are in-policy.
6. Switch to the seller key (one click in the hub's Judge key panel once both
   keys are pasted) and accept the offer. Expect an atomic RESERVED result, a
   redacted receipt and an idempotent replay response. Alternatively click
   "Let the synthetic seller respond": it counters at 1,350 EUR, and the buyer
   agent's accept is refused with APPROVAL_REQUIRED.
7. Contact details stay redacted until bilateral owner consent. All identities,
   listings and messages in this sandbox are synthetic.

Evidence and exact proof boundaries:
https://github.com/thannous/clawdeals/blob/main/HACKATHON.md
```

The final tested-clients field must stay explicit about proof boundaries:

```text
We verified the public WebMCP flow natively in Codex's in-app browser. The
authenticated sandbox also passed in Playwright Chromium using a
`document.modelContext` compatibility layer. In Chrome 151, enabling the testing
flag exposed the native runtime and all eleven tools, although we did not record
an Inspector-triggered call or its request ID. We have not yet tested the flow
in ChatGPT's in-app browser.
```

## Video demo link

https://youtu.be/mjNd6BNk_0U — public oEmbed and anonymous watch HTTP 200 verified.

Local video proof:
[`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md).

## Submission media — uploaded to the saved draft

All three images are deterministic 1920×1080 JPEG frames generated with the
current video. The files remain in the gitignored package and were uploaded to
the saved Devpost gallery; the hero was also uploaded as the project thumbnail.

1. YouTube thumbnail / Devpost cover:
   `submission-assets/webmcp-challenge/frames/00-hero.jpg`
   - caption: `Your agent negotiates. You stay in control.`
   - alt text: `ClawDeals WebMCP judge hub showing the five public guest tools and the human-agent-platform trust model.`
   - SHA-256: `7e11c235f3faea69a0d1d27a88a6bd54abe9042ffe8640229e4e310cd15f678a`
2. Product gallery — policy-aware search:
   `submission-assets/webmcp-challenge/frames/03-search-policy-fit.jpg`
   - caption: `The agent ranks synthetic e-bikes while showing why each candidate fits or violates the owner's policy.`
   - alt text: `Five synthetic e-bike cards with the Agent Activity panel exposing a compact redacted search receipt.`
   - SHA-256: `9ddc1810ac2a588aa14b3c103e7a3ead010358028ec845c15dcfef6eb2d7ba45`
   - rights: includes the credited Lorem Picsum / Unsplash fixture images listed
     in [`VIDEO_EVIDENCE_2026-08-26.md`](./VIDEO_EVIDENCE_2026-08-26.md#media-rights-check)
3. Product gallery — verifiable receipt:
   `submission-assets/webmcp-challenge/frames/14-redacted-receipt.jpg`
   - caption: `Every sensitive action leaves a policy decision, confirmation state and redacted receipt.`
   - alt text: `ClawDeals Agent Activity panel showing redacted receipts beside the Deal Mission interface.`
   - SHA-256: `845cda1d4b5f6caef946675dbb90de7ec08606daa5265b24417ad22099ffd388`

Recheck dimensions and hashes immediately before any YouTube or Devpost upload.

## Finalization checklist

- [x] Explicit judge instruction for ChatGPT in-app and the supported Chrome
  149+ flag is included; Origin Trial is not treated as a required gate.
- [x] Public sandbox credentials are synthetic, kept outside version control and
  verified by the authenticated public Playwright journey.
- [x] Verify the final judge hub in a WebMCP-enabled Chrome profile: native
  runtime and the exact eleven-tool authenticated registry are visible.
- [ ] Invoke a tool through Chrome's Inspector and record its request ID;
  ChatGPT in-app remains a separate, unrun proof layer.
- [x] YouTube video is public, has audio and is shorter than three minutes.
- [x] Replace the stale Devpost story with the exact Markdown above.
- [x] Re-paste the 3 September story (one-line pitch, three ideas, "Who this is
  for", `getTools()` paragraph) into Devpost and preview it.
- [x] Add "Model Context Tool Inspector extension" to the Chrome testing
  instruction and mention the inline **Judge key** field (no developer console
  needed) in the private judge instructions.
- [x] Set the Devpost **Try it out / demo URL** to
  `https://sandbox.clawdeals.com/webmcp-challenge` and reorder the links as in
  **Try it out links** above.
- [x] Replace the demo URL `/webmcp` with `/webmcp-challenge`.
- [x] Add the final public video URL.
- [x] Preview every Devpost section and link.
- [ ] Ask the user for action-time confirmation before final Submit.
- [ ] Record the submitted URL and timestamp, then freeze the judged commit.
