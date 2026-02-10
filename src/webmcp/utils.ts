export function randomUuid(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function isPlainObject(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeCanonical(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeCanonical(item));
  if (isPlainObject(value)) {
    const out: any = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const normalized = normalizeCanonical(value[key]);
        if (normalized !== undefined) out[key] = normalized;
      });
    return out;
  }
  if (typeof value?.toJSON === "function") return normalizeCanonical(value.toJSON());
  return String(value);
}

export function canonicalJsonStringify(value: any): string {
  return JSON.stringify(normalizeCanonical(value));
}

