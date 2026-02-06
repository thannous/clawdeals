import crypto from "node:crypto";

const REDACTED_TOKEN = "[redacted]";

export const TEXT_MESSAGE_TYPES = new Set(["question", "answer", "info"]);

const DEFAULT_PAYMENT_KEYWORDS = [
  "paypal",
  "wise",
  "western union",
  "venmo",
  "cashapp",
  "crypto",
  "bitcoin",
  "ethereum",
  "iban",
  "swift",
  "virement",
  "bank transfer",
  "zelle"
];

function escapeRegexLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePaymentKeywordRegex(keywords: string[]) {
  const patterns = keywords
    .map((raw) => String(raw || "").trim())
    .filter(Boolean)
    .map((keyword) => {
      // Allow flexible spacing for multi-word keywords.
      if (keyword.includes(" ")) {
        const parts = keyword.split(/\s+/).filter(Boolean).map(escapeRegexLiteral);
        return `\\b${parts.join("\\s+")}\\b`;
      }
      return `\\b${escapeRegexLiteral(keyword)}\\b`;
    });

  if (patterns.length === 0) {
    // Never match.
    return /a^/i;
  }

  return new RegExp(patterns.join("|"), "gi");
}

function parseCsvEnvList(value: string | undefined | null) {
  if (!value) return null;
  const items = String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

export function getPaymentKeywordsFromEnv(env: any = process.env) {
  const fromEnv = parseCsvEnvList(env.MESSAGE_REDACTION_PAYMENT_KEYWORDS);
  return fromEnv ?? DEFAULT_PAYMENT_KEYWORDS;
}

export function getRedactionHmacSecret(env: any = process.env) {
  // Reuse the audit HMAC secret by default so we don't introduce a new required env var.
  return env.MESSAGE_REDACTION_HMAC_SECRET || env.AUDIT_HMAC_SECRET || null;
}

export function computeMessageBodyHmac(body: string, env: any = process.env) {
  const secret = getRedactionHmacSecret(env);
  if (!secret) {
    throw new Error("MESSAGE_REDACTION_HMAC_SECRET or AUDIT_HMAC_SECRET is required.");
  }
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function replaceMatches(input: string, regex: RegExp) {
  let matched = false;
  let count = 0;
  const value = input.replace(regex, () => {
    matched = true;
    count += 1;
    return REDACTED_TOKEN;
  });
  return { value, matched, count };
}

function isSafeTextInput(value: unknown) {
  return typeof value === "string";
}

export type MessageRedactionResult = {
  text: string;
  redacted: boolean;
  reasons: Array<"external_link" | "payment_keyword">;
  matchCount: number;
};

export function redactMessageText(input: unknown, { env = process.env }: any = {}): MessageRedactionResult {
  if (!isSafeTextInput(input)) {
    return { text: "", redacted: false, reasons: [], matchCount: 0 };
  }

  // Hard limit on processing to avoid pathological inputs (even if schema validation is missing).
  // Current schemas are <= 1200 chars, so this does not affect valid messages.
  const text = input.length > 5000 ? input.slice(0, 5000) : input;

  let out = text;
  let matchCount = 0;

  // URL-like signals.
  const urlLikeMatchers: RegExp[] = [
    /\bmailto:[^\s]+/gi,
    /\bhttps?:\/\/[^\s]+/gi,
    /\bwww\.[^\s]+/gi,
    // Email addresses.
    /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}\b/gi,
    // Domain with TLD (e.g. example.com/pay). Keeps regex conservative with word boundaries.
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24})(?:\/[^\s]*)?\b/gi
  ];

  let hasExternalLink = false;
  for (const matcher of urlLikeMatchers) {
    const replaced = replaceMatches(out, matcher);
    out = replaced.value;
    if (replaced.matched) {
      hasExternalLink = true;
      matchCount += replaced.count;
    }
  }

  // Payment keywords.
  const paymentKeywords = getPaymentKeywordsFromEnv(env);
  const paymentRegex = compilePaymentKeywordRegex(paymentKeywords);
  const paymentReplaced = replaceMatches(out, paymentRegex);
  out = paymentReplaced.value;
  const hasPaymentKeyword = paymentReplaced.matched;
  matchCount += paymentReplaced.count;

  const reasons: MessageRedactionResult["reasons"] = [];
  if (hasExternalLink) reasons.push("external_link");
  if (hasPaymentKeyword) reasons.push("payment_keyword");

  return {
    text: out,
    redacted: reasons.length > 0,
    reasons,
    matchCount
  };
}
