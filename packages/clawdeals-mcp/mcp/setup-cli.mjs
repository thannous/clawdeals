import { executeConnectSetup } from "./connect-setup.mjs";

const DEFAULT_POLL_SECONDS = 2;
const SUPPORTED_CLIENTS = ["cursor", "claude-desktop", "claude-code", "codex", "windsurf", "gemini"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: clawdeals-mcp setup [options]",
      "",
      "Options:",
      "  --client <name>      cursor|claude-desktop|claude-code|codex|windsurf|gemini",
      "  --agent-name <name>  Agent name shown in claim screen",
      "  --dry-run            Run exchange + verify but do not write config",
      "  --json               Emit JSONL events for automation",
      "  -h, --help           Show this help",
      ""
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = {
    client: "",
    agentName: "",
    dryRun: false,
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "-h" || arg === "--help") {
      out.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      out.json = true;
      continue;
    }
    if (arg === "--client") {
      const value = String(argv[i + 1] || "").trim().toLowerCase();
      if (!value) throw new Error("Missing value for --client");
      if (!SUPPORTED_CLIENTS.includes(value)) {
        throw new Error(`Unsupported --client value: ${value} (expected: ${SUPPORTED_CLIENTS.join("|")})`);
      }
      out.client = value;
      i += 1;
      continue;
    }
    if (arg === "--agent-name") {
      const value = String(argv[i + 1] || "").trim();
      if (!value) throw new Error("Missing value for --agent-name");
      out.agentName = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function emitEvent(modeJson, event, payload = {}) {
  if (modeJson) {
    process.stdout.write(`${JSON.stringify({ event, ...payload })}\n`);
    return;
  }
  if (event === "start") {
    process.stdout.write("mcp:setup: Starting ClawDeals setup flow...\n");
    return;
  }
  if (event === "claim_required") {
    process.stdout.write("\n");
    process.stdout.write("mcp:setup: Approve this device:\n");
    process.stdout.write(`mcp:setup: Claim URL: ${payload.claim_url}\n`);
    process.stdout.write(`mcp:setup: Verification code: ${payload.verification_code}\n`);
    process.stdout.write(`mcp:setup: Expires at: ${payload.expires_at}\n`);
    return;
  }
  if (event === "poll_pending") {
    process.stdout.write(`mcp:setup: Waiting for approval... (next poll in ${payload.wait_seconds}s)\n`);
    return;
  }
  if (event === "claimed") {
    process.stdout.write("mcp:setup: Claim approved. Finalizing installation...\n");
    return;
  }
  if (event === "finalized") {
    process.stdout.write(`mcp:setup: MCP config ${payload.wrote ? "updated" : "prepared"} at ${payload.config_path}\n`);
    if (payload.backup_path) process.stdout.write(`mcp:setup: Backup ${payload.backup_path}\n`);
    return;
  }
  if (event === "success") {
    process.stdout.write("\n");
    process.stdout.write("mcp:setup: ClawDeals installed.\n");
    process.stdout.write("mcp:setup: Restart your IDE so it reloads MCP servers.\n");
    return;
  }
  if (event === "warning") {
    process.stdout.write(`mcp:setup: Warning: ${payload.message}\n`);
    return;
  }
  if (event === "error") {
    process.stderr.write(`mcp:setup: ${payload.message}\n`);
    return;
  }
}

function fail(modeJson, message, code = "ERROR", details = {}) {
  emitEvent(modeJson, "error", { code, message, details });
  process.exit(1);
}

async function runStep(modeJson, input) {
  const result = await executeConnectSetup(input, {
    env: process.env,
    fetchImpl: fetch
  });
  if (!result.ok) {
    fail(modeJson, result.error?.message || "Setup step failed", result.error?.code || "ERROR", result.error?.details || {});
  }
  return result.data || {};
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(false, String(error?.message || error), "VALIDATION_ERROR");
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  emitEvent(options.json, "start", {
    client: options.client || null,
    dry_run: options.dryRun
  });

  const initiated = await runStep(options.json, {
    step: "initiate",
    agent_name: options.agentName || undefined,
    client_type: options.client || "other"
  });

  if (!initiated.session_id || !initiated.poll_token) {
    fail(options.json, "Initiate succeeded but response is missing session_id or poll_token", "ERROR");
  }

  emitEvent(options.json, "claim_required", {
    session_id: initiated.session_id,
    claim_url: initiated.claim_url || null,
    verification_code: initiated.verification_code || null,
    expires_at: initiated.expires_at || null
  });

  let status = String(initiated.status || "PENDING_CLAIM");
  while (status === "PENDING_CLAIM") {
    const poll = await runStep(options.json, {
      step: "poll",
      session_id: initiated.session_id,
      poll_token: initiated.poll_token
    });

    status = String(poll.status || "PENDING_CLAIM");
    if (status === "CLAIMED" || status === "DELIVERED") break;
    if (status === "EXPIRED") {
      fail(options.json, "Connect session expired before approval", "SESSION_EXPIRED");
    }
    if (status === "CANCELLED") {
      fail(options.json, "Connect session was cancelled", "SESSION_CANCELLED");
    }

    const waitSeconds = Number.isFinite(Number(poll.retry_after_seconds))
      ? Math.max(1, Number(poll.retry_after_seconds))
      : Math.max(1, Number(initiated.interval_seconds || DEFAULT_POLL_SECONDS));
    emitEvent(options.json, "poll_pending", {
      session_id: initiated.session_id,
      status,
      wait_seconds: waitSeconds
    });
    await sleep(waitSeconds * 1000);
  }

  emitEvent(options.json, "claimed", {
    session_id: initiated.session_id,
    status
  });

  const finalized = await runStep(options.json, {
    step: "finalize",
    session_id: initiated.session_id,
    poll_token: initiated.poll_token,
    client_type: options.client || "other",
    client: options.client || undefined,
    dry_run: options.dryRun
  });

  emitEvent(options.json, "finalized", {
    session_id: finalized.session_id || initiated.session_id,
    status: finalized.status || null,
    agent_id: finalized.agent_id || null,
    installation_id: finalized.installation_id || null,
    api_key_id: finalized.api_key_id || null,
    config_path: finalized.config_path || null,
    backup_path: finalized.backup_path || null,
    client_type: finalized.client_type || options.client || null,
    wrote: Boolean(finalized.wrote),
    verified: finalized.verified || { ok: false }
  });

  if (!finalized.verified?.ok) {
    emitEvent(options.json, "warning", {
      message: finalized.verified?.error?.message || "Installed but verification failed"
    });
    process.exit(1);
  }

  emitEvent(options.json, "success", {
    config_path: finalized.config_path || null
  });
}

main().catch((error) => {
  fail(false, String(error?.stack || error?.message || error), "ERROR");
});
