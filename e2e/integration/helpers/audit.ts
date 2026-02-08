import { sleep } from "./ids";

export async function waitForAuditLog(
  supabase: any,
  eventName: string,
  attempts = 10,
  minOccurredAt?: string,
  requestId?: string
): Promise<any | null> {
  for (let i = 0; i < attempts; i += 1) {
    let query = supabase
      .from("audit_logs")
      .select("id, action, outcome, occurred_at, payload, security, policy")
      .eq("action->>event", eventName)
      .order("occurred_at", { ascending: false })
      .limit(1);

    if (requestId) {
      query = query.eq("request_id", requestId);
    }

    if (minOccurredAt) {
      query = query.gte("occurred_at", minOccurredAt);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data[0];
    }

    await sleep(200);
  }

  return null;
}

export async function waitForAuditLogMatching(
  supabase: any,
  predicate: (row: any) => boolean,
  attempts = 10
): Promise<any | null> {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, outcome, occurred_at, payload, security, policy")
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const match = data.find(predicate);
      if (match) return match;
    }

    await sleep(300);
  }

  return null;
}
