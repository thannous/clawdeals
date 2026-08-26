#!/usr/bin/env node
import { redactSecrets, verifyPublicSandbox } from "./lib/verify-public-sandbox.mjs";

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[public-sandbox] FAIL: ${redactSecrets(message, [process.env.PUBLIC_SANDBOX_JUDGE_KEY])}`);
  process.exit(1);
}

const report = await verifyPublicSandbox({ env: process.env }).catch(fail);
const rendered = JSON.stringify(report, null, 2);

if (report.status === "PASS") {
  console.log(rendered);
  process.exit(0);
}

console.error(rendered);
process.exit(1);
