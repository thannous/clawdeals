function safeHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function applyAuthStub(req, ctx) {
  const agentId = safeHeader(req, "x-agent-id");
  const ownerId = safeHeader(req, "x-owner-id");
  ctx.agentId = agentId || null;
  ctx.ownerId = ownerId || null;
  if (agentId) {
    ctx.actor = { type: "agent", id: agentId };
  } else if (ownerId) {
    ctx.actor = { type: "owner", id: ownerId };
  } else {
    ctx.actor = { type: "anonymous", id: null };
  }
  return ctx;
}
