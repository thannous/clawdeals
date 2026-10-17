import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const equal = (a, b) => typeof a === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function createClawDealsBridge(runtime) {
  const appOrigin = process.env.CLAWDEALS_LOCAL_APP_ORIGIN;
  const app = new URL(appOrigin);
  if (app.protocol !== "http:" || app.hostname !== "127.0.0.1" || app.origin !== appOrigin || process.env.VERCEL) throw fail("LOCAL_RUNTIME_REQUIRED");
  const keyPath = join(runtime.privateDir, "bridge-key");
  let key;
  try { key = await readFile(keyPath, "utf8"); }
  catch (e) {
    if (e.code !== "ENOENT") throw e;
    key = randomBytes(32).toString("hex");
    await writeFile(keyPath, key, { mode: 0o600, flag: "wx" });
  }
  await chmod(keyPath, 0o600);
  const tickets = new Map();
  let cachedModels = null;
  let modelsAt = 0;
  let analyzing = false;
  const models = async () => {
    if (!cachedModels || Date.now() - modelsAt > 60000) {
      cachedModels = await runtime.models(); modelsAt = Date.now();
    }
    return cachedModels;
  };
  const send = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

  return async (req, res, url) => {
    if (req.method === "GET" && url.pathname === "/health") { send(res, 200, { ready: true, mode: "clawdeals-local" }); return true; }
    if (req.method === "GET" && url.pathname === "/connect") {
      const ticket = url.searchParams.get("ticket");
      const context = tickets.get(ticket);
      tickets.delete(ticket);
      if (!context || context.expiresAt < Date.now()) { send(res, 400, { error: { code: "CONNECTION_EXPIRED" } }); return true; }
      if (runtime.registration().ownerId && runtime.registration().ownerId !== context.ownerId) {
        send(res, 409, { error: { code: "CHATGPT_BOUND_TO_OTHER_OWNER" } }); return true;
      }
      const profile = await runtime.credentials();
      if (runtime.registration().ownerId && runtime.registration().ownerId !== context.ownerId) {
        send(res, 409, { error: { code: "CHATGPT_BOUND_TO_OTHER_OWNER" } }); return true;
      }
      if (profile) {
        runtime.registration().ownerId = context.ownerId;
        await runtime.saveRegistration();
        res.writeHead(303, { Location: context.returnTo }); res.end();
      } else await runtime.authorize(req, res, context);
      return true;
    }
    if (url.pathname !== "/bridge") return false;
    if (req.method !== "POST") { send(res, 405, { error: { code: "METHOD_NOT_ALLOWED" } }); return true; }
    if (!equal(req.headers.authorization, `Bearer ${key}`)) { send(res, 401, { error: { code: "UNAUTHORIZED" } }); return true; }
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 40000) throw fail("BODY_TOO_LARGE", 413); }
      const body = JSON.parse(raw);
      if (!uuid.test(body.ownerId)) throw fail("INVALID_OWNER");
      const registration = runtime.registration();
      const bound = registration.ownerId === body.ownerId;
      if (body.action === "status") {
        const profile = bound ? await runtime.credentials() : null;
        send(res, 200, { connected: Boolean(profile), account: profile?.email || null,
          models: profile ? await models() : [], available: !registration.ownerId || bound });
      } else if (body.action === "connect") {
        if (registration.ownerId && !bound) throw fail("CHATGPT_BOUND_TO_OTHER_OWNER", 409);
        const target = new URL(body.returnTo);
        if (target.origin !== appOrigin || !/^\/(?:fr\/|en\/|es\/)?my\/missions\/[0-9a-f-]{36}$/.test(target.pathname) || target.search || target.hash) throw fail("INVALID_RETURN_URL");
        for (const [id, value] of tickets) if (value.expiresAt < Date.now()) tickets.delete(id);
        if (tickets.size >= 20) throw fail("TOO_MANY_CONNECTIONS", 429);
        const ticket = randomBytes(32).toString("hex");
        tickets.set(ticket, { ownerId: body.ownerId, returnTo: target.href, expiresAt: Date.now() + 300000 });
        send(res, 200, { redirect: `${runtime.origin}/connect?ticket=${ticket}` });
      } else {
        if (!bound) throw fail("PLAN_PERMISSION_REQUIRED", 401);
        if (body.action === "disconnect") {
          if (analyzing || runtime.running()) throw fail("ANALYSIS_RUNNING", 409);
          await runtime.disconnect(); cachedModels = null;
          send(res, 200, { connected: false });
        } else if (body.action === "analyze") {
          if (analyzing || runtime.running()) throw fail("ANALYSIS_RUNNING", 409);
          analyzing = true;
          try {
            if (!Array.isArray(body.listings) || body.listings.length < 1 || body.listings.length > 5 ||
                !body.mission || typeof body.mission.query !== "string" || body.mission.query.length > 80 ||
                typeof body.model !== "string" || !(await models()).some((m) => m.id === body.model)) throw fail("INVALID_ANALYSIS");
            const result = await runtime.infer(body);
            if (result.status !== "passed") throw fail(result.error || "INFERENCE_NOT_COMPLETED", result.error?.includes("usage_limit") ? 429 : 502);
            send(res, 200, { completed: true, text: result.result, model: result.model, listingCount: result.listingCount, usage: result.usage });
          } finally { analyzing = false; }
        } else throw fail("INVALID_ACTION");
      }
    } catch (e) {
      const code = /^[A-Za-z0-9_.-]{1,120}$/.test(e.code || "") ? e.code : "LOCAL_CHATGPT_FAILED";
      send(res, e.status || 502, { error: { code } });
    }
    return true;
  };
}
