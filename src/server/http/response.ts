export type JsonResponse<T = unknown> = {
  type: "json";
  status: number;
  body: T;
  headers: Record<string, string | string[]>;
};

export type ServerResponseLike = {
  statusCode: number;
  // Node/Next.js allow either a string or string[] for headers (notably Set-Cookie).
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string) => void;
};

export function jsonResponse<T>(
  status: number,
  body: T,
  headers: Record<string, string | string[]> = {}
): JsonResponse<T> {
  return {
    type: "json",
    status,
    body,
    headers
  };
}

export function sendJson<T>(
  res: ServerResponseLike,
  status: number,
  body: T,
  headers: Record<string, string | string[]> = {}
) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      res.setHeader(
        key,
        value.filter((v) => v !== undefined && v !== null).map((v) => String(v))
      );
      return;
    }
    res.setHeader(key, String(value));
  });
  res.end(JSON.stringify(body));
}
