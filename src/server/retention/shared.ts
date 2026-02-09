export function parseRetentionDays(value) {
  if (!value) {
    return null;
  }
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return days;
}

export function computeCutoffDate(now, retentionDays) {
  const windowMs = retentionDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - windowMs);
}

export function parseDeletedCount(contentRange) {
  if (!contentRange) {
    return null;
  }
  const parts = contentRange.split("/");
  if (parts.length !== 2) {
    return null;
  }
  const count = Number.parseInt(parts[1], 10);
  return Number.isFinite(count) ? count : null;
}

export async function restRequest({ supabaseUrl, serviceRoleKey, table, timeColumn, method, cutoff, body }: any) {
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set(timeColumn, `lt.${cutoff.toISOString()}`);
  url.searchParams.set("select", "id");

  const response = await fetch(url.toString(), {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "count=exact,return=minimal",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Retention ${method} on ${table} failed: ${response.status} ${text || response.statusText}`);
  }

  return {
    affected: parseDeletedCount(response.headers.get("content-range"))
  };
}
