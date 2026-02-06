import crypto from "node:crypto";

export function randomId() {
  return crypto.randomUUID();
}

export function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

