import crypto from "node:crypto";

type CronAuthRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeaderValue(headers: CronAuthRequest["headers"], name: string) {
  if (!headers) return undefined;
  const direct = headers[name] || headers[name.toLowerCase()];
  if (direct !== undefined) return getFirstHeaderValue(direct);

  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? getFirstHeaderValue(headers[key]) : undefined;
}

function timingSafeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function matchesAnySecret(value: string, secrets: string[]) {
  return secrets.some((secret) => timingSafeEqualString(value, secret));
}

export function isInternalCronAuthorized(req: CronAuthRequest) {
  const internalSecret = process.env.INTERNAL_CRON_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const xCronSecret = getHeaderValue(req.headers, "x-cron-secret");
  if (internalSecret && typeof xCronSecret === "string" && xCronSecret) {
    if (timingSafeEqualString(xCronSecret, internalSecret)) return true;
  }

  const bearerSecrets = [cronSecret, internalSecret].filter(
    (secret): secret is string => typeof secret === "string" && secret.length > 0
  );
  const authorization = getHeaderValue(req.headers, "authorization");
  if (typeof authorization === "string" && bearerSecrets.length > 0) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1] && matchesAnySecret(match[1], bearerSecrets)) return true;
  }

  return false;
}
