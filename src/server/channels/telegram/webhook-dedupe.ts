import { getNumberEnv } from "../../config/env";
import { createHmacFingerprint } from "../../audit/fingerprint";
import { getRedis } from "../../redis/upstash";

const DEFAULT_DEDUPE_TTL_SECONDS = 600;

function requireAuditSecret() {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) {
    throw new Error("AUDIT_HMAC_SECRET is required for Telegram webhook dedupe.");
  }
  return secret;
}

export function getTelegramWebhookDedupeTtlSeconds() {
  return (
    getNumberEnv("TELEGRAM_WEBHOOK_DEDUPE_TTL_SECONDS", { defaultValue: DEFAULT_DEDUPE_TTL_SECONDS }) ??
    DEFAULT_DEDUPE_TTL_SECONDS
  );
}

export function buildTelegramWebhookDedupeKey(data: any) {
  const secret = requireAuditSecret();
  const hmac = createHmacFingerprint({ secret, data });
  return `tg:wh:dedupe:${hmac}`;
}

export async function markTelegramWebhookSeen({
  data,
  ttlSeconds = getTelegramWebhookDedupeTtlSeconds(),
  redis
}: {
  data: any;
  ttlSeconds?: number;
  redis?: any;
}) {
  const key = buildTelegramWebhookDedupeKey(data);
  const client = redis || getRedis();
  const result = await client.set(key, "1", { nx: true, ex: ttlSeconds });
  return { key, ok: Boolean(result) };
}

