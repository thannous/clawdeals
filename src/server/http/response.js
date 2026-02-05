export function jsonResponse(status, body, headers = {}) {
  return {
    type: "json",
    status,
    body,
    headers
  };
}

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) res.setHeader(key, String(value));
  });
  res.end(JSON.stringify(body));
}
