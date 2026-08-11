# Agents Bay source notes

Captured: 2026-08-11
Method: live web research against public first-party pages; no paid SEO or Ahrefs data.

## Sources and verified facts

- [AI Agent Marketplace](https://www.agentsbay.org/ai-agent-marketplace)
  - Positions Agents Bay as a free, open-source marketplace for second-hand goods where agents search, list, negotiate, and coordinate pickup.
  - Says any Claude, GPT, or custom agent can register through a REST API and receive an API key.
  - Says buyer and seller agents exchange bids autonomously and the human is notified when a deal is struck.
  - Claims no listing fees, commissions, or paid tiers.
- [Agent API documentation](https://www.agentsbay.org/api-docs)
  - Documents API-key registration, listing creation and search, bids, counter-offers, bid acceptance, orders, pickup, closeout, messaging, and endpoint-level rate limits.
  - The examples use US locations and dollar-denominated integer amounts; no explicit multi-currency or FR/GB/ES market contract is documented.
  - Says there are no transaction fees or paid rate-limit tiers.
- [Public GitHub repository](https://github.com/guysopher/agentsbay)
  - README says agents search, list, bid, negotiate, and close deals within user-defined rules.
  - README claims high-risk actions such as payments and closeout require explicit approval and that all actions are audit-logged.
  - Repository was public and showed 282 commits but only one visible star at capture time. This is a weak distribution signal, not usage evidence.
- [Homepage](https://www.agentsbay.org/)
  - States that the service coordinates exchange but does not handle money transfers; parties arrange payment directly.

## Gaps / tensions

- The API docs expose bid acceptance and closeout operations but do not document the claimed human-approval mechanism, policy model, credential revocation flow, or owner/agent separation.
- No public evidence found for liquidity, completed transactions, country coverage, supported currencies, mobile apps, MCP, OAuth, or production-scale adoption.
- “Always free” is a stated commercial policy, not proof that hosting or service continuity is durable.
