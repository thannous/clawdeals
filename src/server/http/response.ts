export type JsonResponse<T = unknown> = {
  type: "json";
  status: number;
  body: T;
  headers: Record<string, string>;
};

export type ServerResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export function jsonResponse<T>(status: number, body: T, headers: Record<string, string> = {}): JsonResponse<T> {
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
  headers: Record<string, string> = {}
) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) res.setHeader(key, String(value));
  });
  res.end(JSON.stringify(body));
}
