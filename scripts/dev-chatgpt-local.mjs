import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createMockUpstashRedisServer } from "./mock-upstash-redis-rest.mjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
if (process.env.VERCEL) throw new Error("This command runs only on your local machine.");
const port = Number(process.env.CLAWDEALS_APP_LOCAL_PORT || 4327);
const bridgePort = Number(process.env.CLAWDEALS_CHATGPT_LOCAL_PORT || 4318);
for (const value of [port, bridgePort]) if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("Invalid local port.");
if (port === bridgePort) throw new Error("The app and ChatGPT connection need separate ports.");
for (const value of [port, bridgePort]) await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error(`Port ${value} is occupied. Stop the previous local process or choose another port.`)));
  probe.listen(value, "127.0.0.1", () => probe.close(resolve));
});
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, CLAWDEALS_CHATGPT_LOCAL: "1", NEXT_PUBLIC_CLAWDEALS_CHATGPT_LOCAL: "1",
  CLAWDEALS_CHATGPT_INTEGRATION: "1", CLAWDEALS_LOCAL_APP_ORIGIN: origin,
  CLAWDEALS_CHATGPT_LOCAL_PORT: String(bridgePort), APP_HOST: "app.clawdeals.com", MARKETING_HOSTS: "clawdeals.com,www.clawdeals.com",
  NEXT_PUBLIC_APP_URL: origin, NEXT_PUBLIC_API_BASE_URL: origin,
  OWNER_SESSION_COOKIE_SECURE: "false", OWNER_SESSION_COOKIE_DOMAIN: "", OWNER_SESSION_COOKIE_PATH: "/" };
let redis;
if (env.UPSTASH_REDIS_REST_URL?.startsWith("http://127.0.0.1:")) {
  const endpoint = new URL(env.UPSTASH_REDIS_REST_URL);
  redis = createMockUpstashRedisServer({ port: Number(endpoint.port), token: env.UPSTASH_REDIS_REST_TOKEN });
  await redis.listen();
  console.log("Redis local simulé ; Auth et base de données utilisent la configuration .env.local.");
}
const children = [];
let closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  await redis?.close();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void stop());
const start = (args) => {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  children.push(child);
  child.once("exit", code => { if (!closing) void stop(code || 0); });
  child.once("error", () => void stop(1));
  return child;
};
start(["scripts/agents/chatgpt-local/pilot.mjs"]);
let ready = false;
for (let attempt = 0; attempt < 100 && !closing; attempt++) {
  try { const result = await fetch(`http://127.0.0.1:${bridgePort}/health`); if (result.ok && (await result.json()).mode === "clawdeals-local") { ready = true; break; } }
  catch { /* The owned bridge is still starting. */ }
  await new Promise(resolve => setTimeout(resolve, 100));
}
if (!ready) { await stop(1); throw new Error("The local ChatGPT connection did not start. Install its dependencies first."); }
start(["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]);
console.log(`ClawDeals + ChatGPT : ${origin}/fr/my/missions/new`);
