# Secret audit — 26 August 2026

This audit covers the public repository, its Git history and the documentation candidate prepared on 26 August 2026. It does not publish or copy any local credential.

## References

- Repo plan: https://github.com/thannous/clawdeals/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md
- Drive plan: https://drive.google.com/file/d/1ayeRe0rY5si4eQSg6IgolprYZvKrR_2V/view?usp=drivesdk
- Eligibility ticket: [TI-372](https://linear.app/ti-max/issue/TI-372/hackathon-prouver-leligibilite-figer-la-baseline-et-ouvrir-la)

## Result

**PASS with reviewed false positives:** no confirmed credential, private key, provider token or vendor credit remains in the committed history or the candidate documentation.

| Layer | Tool / scope | Result |
| --- | --- | --- |
| GitHub remote | GitHub Secret Scanning alerts for `thannous/clawdeals` | 0 alerts |
| Full Git history | Gitleaks `8.30.1`, `git --log-opts=--all` | 492 commits scanned; 34 candidates; 0 confirmed secrets after manual triage |
| Candidate tracked tree | Gitleaks `8.30.1` on a `git archive HEAD` plus the pending documentation files | 10.05 MB scanned; 33 candidates; 0 confirmed secrets after manual triage |
| Known-token patterns | Current tracked/untracked candidate and full patch history, excluding lockfiles | No AWS, GitHub, Slack, OpenAI-style key, private-key block or vendor-credit pattern found after redaction |
| Local environment | `.env.local` | Contains local credentials as expected; verified ignored by `.gitignore` and excluded from the candidate archive |

## Triage of the Gitleaks candidates

The scanner findings were retained and classified rather than silently allowlisted:

| Cluster | Classification | Evidence |
| --- | --- | --- |
| `src/ui/developer/connect/*.test.tsx` | Synthetic test data | Values use explicit `cd_live_test`, `cd_live_generated`, `cd_live_manual`, `cd_live_existing` or equivalent fixture prefixes. |
| `docs/sandbox-getting-started.md` | Documentation placeholders | Curl examples use `YOUR_API_KEY` or `YOUR_JUDGE_API_KEY` on localhost. |
| `docs/hackathon/release-candidate-runbook.md` | Documentation placeholders | Uses `<JUDGE_API_KEY>` and a fixed non-secret idempotency label. |
| `docs/mcp-tools-spec.md` | Non-secret UUID example | The finding is an idempotency UUID, not an authentication credential. |
| `src/__tests__/pages-api/oauth/token.test.ts` | Field-name false positive | The match is the `oauthScopes` field and public scope constants. |
| `e2e/integration/risk-rules.spec.ts` | Field-name false positive | The match is a risk-rule identifier (`duplicates_detected_24h`). |
| `src/pages/_document.tsx` | Public browser identifier | The Ahrefs Analytics `data-key` is intentionally delivered to every browser and is not an account credential or write token. |

Historical findings are the same classes in earlier versions of these files. No high-confidence provider-specific rule produced a confirmed secret.

## Documentation redaction

The pending session journal initially contained an account email and two vendor-credit strings. They were removed before staging. The candidate file now contains only `[redacted account email]` and `[redacted vendor credit]` markers.

## Boundary

This proves the reviewed repository and candidate documentation contain no confirmed secret detectable by GitHub Secret Scanning, Gitleaks 8.30.1 or the additional provider-pattern pass. It does not prove that arbitrary future commits or unknown secret formats are safe; the scan must be repeated immediately before the final tag.
