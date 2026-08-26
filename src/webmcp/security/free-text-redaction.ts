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
const PHONE_CANDIDATE_REGEX = /(?:\+|00)?\d[\d\s().-]{8,}\d/g;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

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

  const preservedUuids: string[] = [];
  let out = text.replace(UUID_REGEX, (uuid) => {
    const index = preservedUuids.push(uuid) - 1;
    return `__CLAWDEALS_UUID_${index}__`;
  });
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

  out = out.replace(/__CLAWDEALS_UUID_(\d+)__/g, (marker, indexText) => {
    const uuid = preservedUuids[Number(indexText)];
    return uuid || marker;
  });

  return { text: out, redacted: matchCount > 0, matchCount };
}
