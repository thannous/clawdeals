import crypto from "node:crypto";

export function randomId() {
  return crypto.randomUUID();
}

export function randomIp() {
  // Large space to avoid collisions across runs when rate limit state persists in Redis.
  const bytes = crypto.randomBytes(4);
  const o1 = 10;
  const o2 = bytes[1];
  const o3 = bytes[2];
  const o4 = (bytes[3] % 254) + 1; // 1..254
  return `${o1}.${o2}.${o3}.${o4}`;
}

export function sha256Hex(value: string | Buffer | Uint8Array) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
