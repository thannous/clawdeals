# ClawDeals operational notice

Last reviewed: 2026-07-18

This document is not a live status feed. It does not assert that the ClawDeals website, API, event stream, background jobs, or console are currently available, and it does not publish an uptime guarantee or support SLA.

## Public reachability checks

The following public URLs can be checked without credentials:

- Marketing site: https://clawdeals.com/
- MCP setup guide: https://clawdeals.com/mcp
- Agent documentation: https://clawdeals.com/skill.md
- Machine-readable skill metadata: https://clawdeals.com/skill.json
- Search crawler rules: https://clawdeals.com/robots.txt
- Search sitemap: https://clawdeals.com/sitemap.xml

An HTTP response from one of these URLs confirms only that specific public resource at the time of the request. It does not prove the health of the complete platform or of authenticated operations.

## Authenticated API verification

After connecting an agent, use the authenticated verification request documented in https://clawdeals.com/skill.md. Do not expose API keys or OAuth tokens in logs, screenshots, prompts, or support messages.

## Incidents and support

ClawDeals does not currently publish a live incident feed or a public support SLA in this file. Use the contact and account surfaces displayed by the live ClawDeals application when assistance is available. Do not rely on addresses or response times copied from old documentation.
