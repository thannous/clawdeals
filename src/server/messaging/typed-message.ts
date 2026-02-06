import { isUuid } from "../utils/validators";

const MESSAGE_TYPES = new Set([
  "question",
  "answer",
  "info",
  "warning",
  "offer",
  "counter_offer",
  "accept",
  "decline",
  "cancel"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeText(value: string) {
  // Strip ASCII control chars to avoid log/UI issues.
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const sanitized = sanitizeText(value).trim();
  return sanitized ? sanitized : null;
}

function enforceNoExtraKeys(obj: Record<string, unknown>, allowedKeys: Set<string>) {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return key;
    }
  }
  return null;
}

export type TypedMessageType =
  | "question"
  | "answer"
  | "info"
  | "warning"
  | "offer"
  | "counter_offer"
  | "accept"
  | "decline"
  | "cancel";

export type TypedMessagePayload =
  | { type: "question"; text: string }
  | { type: "answer"; text: string }
  | { type: "info"; text: string }
  | { type: "warning"; code: string; text: string }
  | { type: "offer"; offer_id: string }
  | { type: "counter_offer"; offer_id: string; previous_offer_id: string }
  | { type: "accept"; offer_id: string }
  | { type: "decline"; offer_id: string }
  | { type: "cancel"; offer_id: string };

export type TypedMessageNormalized = {
  type: TypedMessageType;
  payload: TypedMessagePayload;
};

export type TypedMessageParseError = {
  code: "SCHEMA_VALIDATION_FAILED" | "TEXT_TOO_LONG";
  message: string;
  details?: unknown;
};

export type ParseTypedMessageResult =
  | { ok: true; value: TypedMessageNormalized }
  | { ok: false; error: TypedMessageParseError };

export function isTypedMessageParseError(
  result: ParseTypedMessageResult
): result is Extract<ParseTypedMessageResult, { ok: false }> {
  return result.ok === false;
}

function schemaError(message: string, details?: unknown): ParseTypedMessageResult {
  return { ok: false, error: { code: "SCHEMA_VALIDATION_FAILED", message, details } };
}

function tooLongError(message: string, details?: unknown): ParseTypedMessageResult {
  return { ok: false, error: { code: "TEXT_TOO_LONG", message, details } };
}

export function parseTypedMessage(input: unknown, options: { allowWarning?: boolean } = {}): ParseTypedMessageResult {
  if (!isPlainObject(input)) {
    return schemaError("Message must be an object");
  }

  const rawType = normalizeNonEmptyString(input.type);
  if (!rawType) {
    return schemaError("type is required");
  }
  const type = rawType.toLowerCase();
  if (!MESSAGE_TYPES.has(type)) {
    return schemaError("Unknown message type");
  }
  const normalizedType = type as TypedMessageType;

  if (normalizedType === "question" || normalizedType === "info") {
    const extra = enforceNoExtraKeys(input, new Set(["type", "text"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const text = normalizeNonEmptyString(input.text);
    if (!text) return schemaError("text is required");
    if (text.length > 800) return tooLongError("text must be 1..800 characters");

    if (normalizedType === "question") {
      return { ok: true, value: { type: normalizedType, payload: { type: "question", text } } };
    }
    return { ok: true, value: { type: normalizedType, payload: { type: "info", text } } };
  }

  if (normalizedType === "answer") {
    const extra = enforceNoExtraKeys(input, new Set(["type", "text"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const text = normalizeNonEmptyString(input.text);
    if (!text) return schemaError("text is required");
    if (text.length > 1200) return tooLongError("text must be 1..1200 characters");

    return { ok: true, value: { type: normalizedType, payload: { type: normalizedType, text } } };
  }

  if (normalizedType === "warning") {
    if (options.allowWarning !== true) {
      return schemaError("warning messages are system-only");
    }

    const extra = enforceNoExtraKeys(input, new Set(["type", "code", "text"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const code = normalizeNonEmptyString(input.code);
    if (!code) return schemaError("code is required");

    const text = normalizeNonEmptyString(input.text);
    if (!text) return schemaError("text is required");
    if (text.length > 400) return tooLongError("text must be 1..400 characters");

    return { ok: true, value: { type: normalizedType, payload: { type: normalizedType, code, text } } };
  }

  if (normalizedType === "offer") {
    const extra = enforceNoExtraKeys(input, new Set(["type", "offer_id"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const offerId = normalizeNonEmptyString(input.offer_id);
    if (!offerId) return schemaError("offer_id is required");
    if (!isUuid(offerId)) return schemaError("offer_id must be a UUID");

    return { ok: true, value: { type: normalizedType, payload: { type: normalizedType, offer_id: offerId } } };
  }

  if (normalizedType === "counter_offer") {
    const extra = enforceNoExtraKeys(input, new Set(["type", "offer_id", "previous_offer_id"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const offerId = normalizeNonEmptyString(input.offer_id);
    if (!offerId) return schemaError("offer_id is required");
    if (!isUuid(offerId)) return schemaError("offer_id must be a UUID");

    const previousOfferId = normalizeNonEmptyString(input.previous_offer_id);
    if (!previousOfferId) return schemaError("previous_offer_id is required");
    if (!isUuid(previousOfferId)) return schemaError("previous_offer_id must be a UUID");

    return {
      ok: true,
      value: { type: normalizedType, payload: { type: normalizedType, offer_id: offerId, previous_offer_id: previousOfferId } }
    };
  }

  if (normalizedType === "accept" || normalizedType === "decline" || normalizedType === "cancel") {
    const extra = enforceNoExtraKeys(input, new Set(["type", "offer_id"]));
    if (extra) return schemaError(`Unknown field: ${extra}`);

    const offerId = normalizeNonEmptyString(input.offer_id);
    if (!offerId) return schemaError("offer_id is required");
    if (!isUuid(offerId)) return schemaError("offer_id must be a UUID");

    if (normalizedType === "accept") {
      return { ok: true, value: { type: normalizedType, payload: { type: "accept", offer_id: offerId } } };
    }
    if (normalizedType === "decline") {
      return { ok: true, value: { type: normalizedType, payload: { type: "decline", offer_id: offerId } } };
    }
    return { ok: true, value: { type: normalizedType, payload: { type: "cancel", offer_id: offerId } } };
  }

  return schemaError("Unsupported message type");
}
