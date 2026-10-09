## Summary

<!-- What changes and why. -->

## Local proof

<!--
Common delivery rule v2 (AGENTS.md). Run `npm run verify:pr` on the PR head,
then replace this section with the output of
`node scripts/verify-local.mjs proof-block`. Add every other check you ran
(browser journeys, integration suites, SDK checks). If `main` moves before
merging: merge it into this branch, rerun `npm run verify:pr` (only checks
whose inputs changed run again) and update this section.
-->
- Commands: `npm run verify:pr`
- Commit SHA: `…`
- Result: …
- Tree (`git rev-parse <sha>^{tree}`): `…`
- Specialised checks (database, browser, mobile, corpus): run: … / out of scope: …
- Integration: base unchanged / base moved, checks replayed: …
