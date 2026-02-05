function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (isPlainObject(value)) {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const normalized = normalize(value[key]);
        if (normalized !== undefined) sorted[key] = normalized;
      });
    return sorted;
  }
  if (typeof value.toJSON === "function") return normalize(value.toJSON());
  return String(value);
}

export function canonicalJsonStringify(value) {
  return JSON.stringify(normalize(value));
}
