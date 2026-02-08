function clampInt(value: number, min: number, max: number) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

export function maskEmail(email: string) {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "";

  const local = trimmed.slice(0, at);
  const domainFull = trimmed.slice(at + 1);
  const dot = domainFull.lastIndexOf(".");

  const localFirst = local[0] || "*";
  const localMasked = `${localFirst}***`;

  if (dot <= 0 || dot === domainFull.length - 1) {
    const domainFirst = domainFull[0] || "*";
    const stars = clampInt(domainFull.length - 1, 2, 6);
    return `${localMasked}@${domainFirst}${"*".repeat(stars)}`;
  }

  const domainRoot = domainFull.slice(0, dot);
  const tld = domainFull.slice(dot + 1);
  const domainFirst = domainRoot[0] || "*";
  const stars = clampInt(domainRoot.length - 1, 2, 6);

  return `${localMasked}@${domainFirst}${"*".repeat(stars)}.${tld}`;
}

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

function detectCountryCode(e164: string) {
  const trimmed = String(e164 || "").trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = digitsOnly(trimmed);
  if (!digits) return null;
  if (digits.startsWith("1")) return "1";
  if (digits.length < 2) return null;
  return digits.slice(0, 2);
}

export function maskPhoneE164(phoneE164: string) {
  if (!phoneE164 || typeof phoneE164 !== "string") return "";
  const cc = detectCountryCode(phoneE164);
  if (!cc) return "";

  const digits = digitsOnly(phoneE164);
  const national = digits.slice(cc.length);
  const last4 = (national.length >= 4 ? national.slice(-4) : national.padStart(4, "*")).replace(/\*/g, "*");
  const pair1 = last4.slice(0, 2);
  const pair2 = last4.slice(2, 4);

  return `+${cc} ** ** ** ${pair1} ${pair2}`;
}

