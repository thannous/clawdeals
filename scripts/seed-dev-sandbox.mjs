import crypto from "node:crypto";
import dotenv from "dotenv";
import { assertNonProdFromEnv } from "./lib/assert-non-prod-target.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const baseUrl = process.env.DEV_SEED_BASE_URL || process.env.API_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:3000";
const ownerId = process.env.DEV_SEED_OWNER_ID || "11111111-1111-4111-8111-111111111111";
const ownerEmail = process.env.DEV_SEED_OWNER_EMAIL || `dev-seed+${ownerId.slice(0, 8)}@example.com`;
const agentName = process.env.DEV_SEED_AGENT_NAME || "dev-sandbox-seed-agent";

assertNonProdFromEnv(process.env, {
  context: "dev sandbox seed",
  supabaseKeys: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  apiKeys: ["DEV_SEED_BASE_URL", "API_BASE_URL", "E2E_BASE_URL", "SMOKE_BASE_URL"]
});

function maskApiKey(value) {
  if (typeof value !== "string" || !value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(method, path, { headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await readBody(response);
  return { response, payload };
}

function randomId() {
  return crypto.randomUUID();
}

async function ensureOwner() {
  const { response, payload } = await requestJson("PATCH", "/api/v1/owner", {
    headers: { "x-owner-id": ownerId },
    body: { email: ownerEmail }
  });

  if (!response.ok) {
    throw new Error(`Failed to ensure owner (${response.status}): ${JSON.stringify(payload)}`);
  }
}

async function listOwnerAgents() {
  const { response, payload } = await requestJson("GET", "/api/v1/owner/agents?limit=50", {
    headers: { "x-owner-id": ownerId }
  });

  if (!response.ok) {
    throw new Error(`Failed to list owner agents (${response.status}): ${JSON.stringify(payload)}`);
  }

  const agents = Array.isArray(payload?.data?.agents) ? payload.data.agents : [];
  return agents;
}

async function createAgent() {
  const { response, payload } = await requestJson("POST", "/api/v1/agents", {
    headers: {
      "x-owner-id": ownerId,
      "Idempotency-Key": randomId()
    },
    body: { name: agentName }
  });

  if (!response.ok) {
    throw new Error(`Failed to create agent (${response.status}): ${JSON.stringify(payload)}`);
  }

  return {
    agentId: payload?.data?.agent_id ? String(payload.data.agent_id) : null,
    apiKey: payload?.data?.api_key ? String(payload.data.api_key) : null
  };
}

async function rotateAgentKey(agentId) {
  const path = `/api/v1/agents/${encodeURIComponent(agentId)}/keys:rotate`;
  const { response, payload } = await requestJson("POST", path, {
    headers: {
      "x-owner-id": ownerId,
      "Idempotency-Key": randomId()
    },
    body: {}
  });

  if (!response.ok) {
    throw new Error(`Failed to rotate agent key (${response.status}): ${JSON.stringify(payload)}`);
  }

  const apiKey = payload?.data?.api_key ? String(payload.data.api_key) : null;
  if (!apiKey) {
    throw new Error("Rotate agent key succeeded but no api_key was returned");
  }
  return apiKey;
}

async function resetSandbox(apiKey) {
  const { response, payload } = await requestJson("POST", "/api/v1/sandbox/reset", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: {}
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Sandbox reset endpoint is unavailable (404). Start the API with CLAWDEALS_ENV=sandbox."
      );
    }
    throw new Error(`Failed to reset sandbox (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function run() {
  console.log(`[seed] base URL: ${baseUrl}`);
  console.log(`[seed] owner: ${ownerId}`);

  await ensureOwner();

  let agents = await listOwnerAgents();
  let selectedAgentId = agents?.[0]?.agent_id ? String(agents[0].agent_id) : null;
  let apiKey = null;

  if (!selectedAgentId) {
    const created = await createAgent();
    selectedAgentId = created.agentId;
    apiKey = created.apiKey;
  }

  if (!selectedAgentId) {
    throw new Error("Unable to select or create an agent for sandbox seeding");
  }

  if (!apiKey) {
    apiKey = await rotateAgentKey(selectedAgentId);
  }

  const result = await resetSandbox(apiKey);
  const counts = result?.counts || {};

  console.log("[seed] sandbox fixtures refreshed");
  console.log(
    JSON.stringify(
      {
        owner_id: ownerId,
        agent_id: selectedAgentId,
        api_key: maskApiKey(apiKey),
        seeded_at: result?.seeded_at || null,
        counts: {
          deals: counts.deals || 0,
          listings: counts.listings || 0,
          watchlists: counts.watchlists || 0
        }
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("[seed] failed:", error?.message || String(error));
  process.exit(1);
});
