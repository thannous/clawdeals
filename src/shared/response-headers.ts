type HeaderValue = string | number | string[] | undefined;

type HeaderTarget = {
  getHeader?: (name: string) => HeaderValue;
  setHeader: (name: string, value: string) => void;
};

function normalizeToken(value: string): string {
  return String(value || "").trim();
}

function splitVaryHeader(value: HeaderValue): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  return raw
    .split(",")
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

export function appendVaryHeaders(res: HeaderTarget, headerNames: string[]): void {
  const existing = splitVaryHeader(res.getHeader?.("Vary"));
  const seen = new Set(existing.map((token) => token.toLowerCase()));
  const merged = [...existing];

  for (const headerName of headerNames) {
    const token = normalizeToken(headerName);
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(token);
  }

  if (merged.length > 0) {
    res.setHeader("Vary", merged.join(", "));
  }
}
