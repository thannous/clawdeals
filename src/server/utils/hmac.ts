import crypto from "crypto";

export function hmacSha256(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
