export type FreeTextRedactionResult = {
  text: string;
  redacted: boolean;
  matchCount: number;
};

type Options = {
  replaceWith?: string;
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}\b/gi;
const MAILTO_REGEX = /\bmailto:[^\s]+/gi;

// Tolerant phone matcher:
// - Allows "+", "00" prefix, spaces, parentheses, dots, and dashes.
// - We only redact if the matched token contains >= 10 digits.
const PHONE_CANDIDATE_REGEX = /(?:\+|00)?\d[\d\s().-]{8,}\d/g;

function countDigits(value: string) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 48 && c <= 57) count += 1;
  }
  return count;
}

export function redactEmailsAndPhones(text: string, options: Options = {}): FreeTextRedactionResult {
  const replaceWith = options.replaceWith ?? "[REDACTED]";
  if (typeof text !== "string") {
    return { text: "", redacted: false, matchCount: 0 };
  }

  let out = text;
  let matchCount = 0;

  out = out.replace(MAILTO_REGEX, () => {
    matchCount += 1;
    return replaceWith;
  });

  out = out.replace(EMAIL_REGEX, () => {
    matchCount += 1;
    return replaceWith;
  });

  out = out.replace(PHONE_CANDIDATE_REGEX, (match) => {
    if (countDigits(match) < 10) {
      return match;
    }
    matchCount += 1;
    return replaceWith;
  });

  return { text: out, redacted: matchCount > 0, matchCount };
}

