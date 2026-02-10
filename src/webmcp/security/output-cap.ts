function utf8ByteLength(value: string): number {
  // TextEncoder is available in modern browsers and Node 18+.
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return Buffer.byteLength(value, "utf8");
  }
}

function isPlainObject(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function tryTruncateArrays(value: any): { value: any; truncated: boolean } {
  if (!value || typeof value !== "object") return { value, truncated: false };

  if (Array.isArray(value)) {
    if (value.length <= 20) return { value, truncated: false };
    return { value: value.slice(0, 20), truncated: true };
  }

  if (!isPlainObject(value)) return { value, truncated: false };

  // Common payload patterns we want to keep small.
  const arrayKeys = ["items", "approvals", "data"];
  let truncated = false;
  const out: any = { ...value };
  for (const key of arrayKeys) {
    const entry = out[key];
    if (Array.isArray(entry) && entry.length > 20) {
      out[key] = entry.slice(0, 20);
      truncated = true;
    }
  }
  return { value: out, truncated };
}

export function capToolOutputBytes<T>(
  value: T,
  { maxBytes = 16 * 1024 }: { maxBytes?: number } = {}
): { value: T; truncated: boolean; maxBytes: number } {
  const initialJson = JSON.stringify(value);
  const initialBytes = utf8ByteLength(initialJson);
  if (initialBytes <= maxBytes) {
    return { value, truncated: false, maxBytes };
  }

  // Try a cheap truncation pass; if still too large, fall back to an error-shaped minimal payload.
  const truncatedOnce = tryTruncateArrays(value);
  const truncatedJson = JSON.stringify(truncatedOnce.value);
  if (utf8ByteLength(truncatedJson) <= maxBytes) {
    return { value: truncatedOnce.value as T, truncated: true, maxBytes };
  }

  const minimal: any = {
    truncated: true,
    message: "Tool output exceeded max size and was truncated"
  };
  return { value: minimal as T, truncated: true, maxBytes };
}

