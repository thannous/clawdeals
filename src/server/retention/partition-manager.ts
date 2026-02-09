const DEFAULT_TABLES = ["audit_logs"];
const MONTHS_AHEAD = 2;

function formatMonth(year, month) {
  return `${year}_${String(month).padStart(2, "0")}`;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function generatePartitionPlan(now, tables) {
  const statements: string[] = [];
  for (const table of tables) {
    for (let offset = 0; offset <= MONTHS_AHEAD; offset++) {
      const start = monthStart(addMonths(now, offset));
      const end = monthStart(addMonths(now, offset + 1));
      const suffix = formatMonth(start.getFullYear(), start.getMonth() + 1);
      const name = `${table}_${suffix}`;
      statements.push(
        `CREATE TABLE IF NOT EXISTS public.${name} PARTITION OF public.${table} FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`
      );
    }
  }
  return statements;
}

async function executeSql({ supabaseUrl, serviceRoleKey, sql }: any) {
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/rest/v1/rpc/`;

  // Use a lightweight RPC wrapper. If no RPC is available, fall back to direct SQL via pg_net
  // or simply log. For V1 we use the Supabase REST RPC convention.
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ query: sql })
  });

  return { ok: response.ok, status: response.status };
}

export async function ensureFuturePartitions({
  env = process.env,
  now = new Date(),
  tables = DEFAULT_TABLES
}: any = {}) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      skipped: true,
      reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const statements = generatePartitionPlan(now, tables);
  const results: any[] = [];

  for (const sql of statements) {
    try {
      const res = await executeSql({ supabaseUrl, serviceRoleKey, sql });
      results.push({ sql, ok: res.ok, status: res.status });
    } catch (error) {
      results.push({ sql, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { partitions: results };
}

export { generatePartitionPlan };
