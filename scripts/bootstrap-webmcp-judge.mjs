import { createClient } from "@supabase/supabase-js";

import {
  applyPublicSandboxBootstrap,
  createSupabaseBootstrapStore,
  DEFAULT_SECRETS_FILE,
  redactBootstrapSecrets,
  resolveBootstrapConfig
} from "./lib/bootstrap-webmcp-judge.mjs";

function parseArgs(argv) {
  let apply = false;
  let secretsFile = DEFAULT_SECRETS_FILE;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--secrets-file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--secrets-file requires a path");
      }
      secretsFile = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { apply, secretsFile };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveBootstrapConfig(process.env, args);

  if (!config.apply) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "DRY_RUN",
          network: "NOT_USED",
          database_mutation: "NOT_USED",
          sandbox_url: config.sandboxUrl,
          supabase_ref: config.supabaseRef,
          judge_agent_id: config.judgeAgentId,
          secrets_file: config.secretsPath,
          next_step: "Re-run with --apply only after the isolated branch, host, migrations and secrets are ready."
        },
        null,
        2
      )
    );
    return;
  }

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await applyPublicSandboxBootstrap(config, {
    store: createSupabaseBootstrapStore(client)
  });
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error(
    `[webmcp-judge-bootstrap] FAIL: ${redactBootstrapSecrets(error?.message || String(error), [
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ])}`
  );
  process.exitCode = 1;
});
