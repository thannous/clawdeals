import type { JsonResponse } from "../http/response";
import { decryptJson, encryptJson } from "./crypto";

// Distinct outer version: never infer an envelope from an arbitrary legacy body.
// AAD binds that version to the ciphertext, preventing a v2 -> v1 downgrade.
const PREFIX = "v2:";
const AAD = "clawdeals:idempotency:response:v2";
const SENSITIVE_HEADERS = new Set([
  "set-cookie", "cookie", "authorization", "proxy-authorization",
  "x-api-key", "api-key", "x-auth-token"
]);

type ResponseEnvelope = {
  version: 2;
  body: unknown;
  headers: JsonResponse["headers"];
};

export function shouldEncryptResponseHeaders(headers: JsonResponse["headers"]) {
  return Object.keys(headers).some((name) => SENSITIVE_HEADERS.has(name.toLowerCase()));
}

export function isResponseEnvelope(payload: unknown): payload is string {
  return typeof payload === "string" && payload.startsWith(PREFIX);
}

export function encryptResponseEnvelope({ secret, body, headers }: {
  secret: string | undefined;
  body: unknown;
  headers: JsonResponse["headers"];
}) {
  const payload: ResponseEnvelope = { version: 2, body, headers };
  return PREFIX + encryptJson({ secret, payload, additionalAuthenticatedData: AAD });
}

export function decryptResponseEnvelope({ secret, payload }: { secret: string | undefined; payload: string }): ResponseEnvelope {
  const envelope = decryptJson({ secret, payload: payload.slice(PREFIX.length), additionalAuthenticatedData: AAD });
  if (!envelope || envelope.version !== 2 || !Object.hasOwn(envelope, "body") ||
      !envelope.headers || typeof envelope.headers !== "object" || Array.isArray(envelope.headers) ||
      !Object.values(envelope.headers).every((value) => typeof value === "string" ||
        (Array.isArray(value) && value.every((entry) => typeof entry === "string")))) {
    throw new Error("Encrypted response envelope is malformed.");
  }
  return envelope;
}
