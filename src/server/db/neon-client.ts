import { ensureNeonRuntimeRole, getNeonSql } from "./neon";

// Reconstructed 2026-11-05 from retained code and current call-site contracts.
// This is a new artifact, not a byte-identical recovery of the lost checkout.
export type NeonExecutor = (sql: string, params: unknown[], options?: { signal?: AbortSignal }) => Promise<Record<string, any>[]>;
type Result = { data: any; error: any; count: number | null; status: number; statusText: string };
type Filter = { column: string; operator: string; value: unknown; negate?: boolean } | { expression: string };
const ident = (value: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Unsupported database identifier");
  return `"${value}"`;
};
function split(input: string): string[] {
  const result: string[] = [];
  let depth = 0, quote = false, escaped = false, start = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === "\\") { escaped = true; continue; }
    if (char === '"') { quote = !quote; continue; }
    if (quote) continue;
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) throw new Error("Unbalanced expression");
    if (char === "," && depth === 0) { result.push(input.slice(start, i).trim()); start = i + 1; }
  }
  if (depth || quote || escaped) throw new Error("Unbalanced expression");
  result.push(input.slice(start).trim());
  if (result.some((item) => !item)) throw new Error("Empty expression");
  return result;
}
const unquote = (value: string) => value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\([\\"])/g, "$1") : value;
function nonnegative(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid database range");
  return value;
}
// Only actual many-to-one relationships used by server queries. Never infer a
// join from caller identifiers or silently weaken an !inner owner filter.
const RELATIONS: Record<string, Record<string, [string, string]>> = {
  watchlists: { agents: ["agent_id", "id"] },
  api_keys: { agents: ["agent_id", "id"] },
  agent_installations: { agents: ["agent_id", "id"], owners: ["owner_id", "owner_id"] },
  agents: { owners: ["owner_id", "owner_id"] }
};
class NeonQuery implements PromiseLike<Result> {
  private operation = "select";
  private projection = "*";
  private returning = false;
  private payload: any;
  private options: any = {};
  private filters: Filter[] = [];
  private orders: { column: string; ascending?: boolean; nullsFirst?: boolean }[] = [];
  private take?: number;
  private skip = 0;
  private cardinality?: "single" | "maybe";
  private signal?: AbortSignal;
  private countMode?: string;
  private head = false;
  private execution?: Promise<Result>;
  constructor(private execute: NeonExecutor, private table: string, private rpcArgs?: Record<string, unknown>, private afterCommit?: () => Promise<void>) {
    ident(table);
    if (rpcArgs !== undefined) this.operation = "rpc";
  }
  select(columns = "*", options: any = {}) { this.projection = columns; this.returning = true; this.countMode = options.count; this.head = !!options.head; return this; }
  insert(payload: any, options: any = {}) { this.operation = "insert"; this.payload = payload; this.options = options; return this; }
  upsert(payload: any, options: any = {}) { this.operation = "upsert"; this.payload = payload; this.options = options; return this; }
  update(payload: any, options: any = {}) { this.operation = "update"; this.payload = payload; this.options = options; return this; }
  delete(options: any = {}) { this.operation = "delete"; this.options = options; return this; }
  filter(column: string, operator: string, value: unknown) { this.filters.push({ column, operator, value }); return this; }
  eq(column: string, value: unknown) { return this.filter(column, "eq", value); }
  neq(column: string, value: unknown) { return this.filter(column, "neq", value); }
  gt(column: string, value: unknown) { return this.filter(column, "gt", value); }
  gte(column: string, value: unknown) { return this.filter(column, "gte", value); }
  lt(column: string, value: unknown) { return this.filter(column, "lt", value); }
  lte(column: string, value: unknown) { return this.filter(column, "lte", value); }
  is(column: string, value: unknown) { return this.filter(column, "is", value); }
  in(column: string, value: unknown[]) { return this.filter(column, "in", value); }
  like(column: string, value: unknown) { return this.filter(column, "like", value); }
  ilike(column: string, value: unknown) { return this.filter(column, "ilike", value); }
  contains(column: string, value: unknown) { return this.filter(column, "cs", value); }
  overlaps(column: string, value: unknown) { return this.filter(column, "ov", value); }
  not(column: string, operator: string, value: unknown) { this.filters.push({ column, operator, value, negate: true }); return this; }
  match(values: Record<string, unknown>) { for (const [key, value] of Object.entries(values)) this.eq(key, value); return this; }
  or(expression: string, options: any = {}) { if (Object.keys(options).length) throw new Error("Unsupported relation filter options"); this.filters.push({ expression }); return this; }
  order(column: string, options: any = {}) { if (options.foreignTable || options.referencedTable) throw new Error("Unsupported relation ordering"); this.orders.push({ column, ...options }); return this; }
  limit(value: number, options: any = {}) { if (Object.keys(options).length) throw new Error("Unsupported relation limit"); this.take = nonnegative(value); return this; }
  range(from: number, to: number) { this.skip = nonnegative(from); this.take = nonnegative(to - from + 1); return this; }
  single() { this.cardinality = "single"; return this; }
  maybeSingle() { this.cardinality = "maybe"; return this; }
  abortSignal(signal?: AbortSignal) { this.signal = signal; return this; }
  then<T = Result, U = never>(fulfilled?: ((value: Result) => T | PromiseLike<T>) | null, rejected?: ((reason: any) => U | PromiseLike<U>) | null): Promise<T | U> {
    this.execution ??= this.run();
    return this.execution.then(fulfilled, rejected);
  }
  private async run(): Promise<Result> {
    try {
      this.signal?.throwIfAborted();
      if (this.countMode && this.countMode !== "exact") throw new Error("Only exact counts are supported");
      const params: unknown[] = [];
      const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
      const relations = new Map<string, { alias: string; join: string; target: string; fields: string }>();
      const fields = split(this.projection).map((field) => {
        const embedded = /^(?:([a-zA-Z_][\w]*):)?([a-zA-Z_][\w]*)(!inner)?\s*\((.*)\)$/.exec(field);
        if (embedded) {
          const [, suppliedAlias, target, inner, columns] = embedded;
          const alias = suppliedAlias || target;
          const relation = RELATIONS[this.table]?.[target];
          if (!relation || this.operation !== "select" || relations.has(alias)) throw new Error("Unsupported embedded relationship");
          const joinAlias = `r${relations.size}`;
          // Resolve related SQL columns before JSON construction. JSON extraction
          // would silently turn an absent SQL column into null, hiding schema drift.
          const columnsSql = split(columns).map((key) => `${bind(key)}::text,${joinAlias}.${ident(key)}`).join(",");
          relations.set(alias, { alias: joinAlias, target, fields: columnsSql, join: `${inner ? "INNER" : "LEFT"} JOIN public.${ident(target)} AS ${joinAlias} ON ${joinAlias}.${ident(relation[1])}=t.${ident(relation[0])}` });
          return `t.${ident(alias)} AS ${ident(alias)}`;
        }
        return field === "*" ? "t.*" : `t.${ident(field)}`;
      }).join(",");
      const column = (input: string, outer = false): string => {
        const path = input.split(/(->>|->)/);
        const root = path[0].split(".");
        let value: string;
        if (root.length === 1) value = `t.${ident(root[0])}`;
        else if (root.length === 2 && relations.has(root[0]) && !outer) value = `${relations.get(root[0]).alias}.${ident(root[1])}`;
        else throw new Error("Unsupported relation column");
        for (let i = 1; i < path.length; i += 2) {
          const key = path[i + 1];
          if (!key || !/^[a-zA-Z0-9_]+$/.test(key)) throw new Error("Unsupported JSON path");
          value += `${path[i]}${/^\d+$/.test(key) ? nonnegative(Number(key)) : `${bind(key)}::text`}`;
        }
        return value;
      };
      const predicate = (key: string, op: string, value: any): string => {
        const col = column(key);
        const operators: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE", cs: "@>", ov: "&&" };
        if (op === "is") {
          if (value !== null && value !== true && value !== false) throw new Error("Invalid IS filter");
          return `${col} IS ${value === null ? "NULL" : value ? "TRUE" : "FALSE"}`;
        }
        if (op === "in") {
          if (!Array.isArray(value)) throw new Error("IN requires array");
          return value.length ? `${col} IN (${value.map(bind).join(",")})` : "FALSE";
        }
        if (!operators[op]) throw new Error("Unsupported filter operator");
        return `${col} ${operators[op]} ${bind(op === "cs" && value && !Array.isArray(value) && typeof value === "object" ? JSON.stringify(value) : value)}`;
      };
      const logic = (input: string, join = "OR"): string => `(${split(input).map((item) => {
        const group = /^(and|or)\((.*)\)$/.exec(item);
        if (group) return logic(group[2], group[1].toUpperCase());
        const match = /^(.+?)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/.exec(item);
        if (!match) throw new Error("Unsupported logical filter");
        let value: unknown = unquote(match[3]);
        if (match[2] === "is") {
          if (!["null", "true", "false"].includes(String(value))) throw new Error("Invalid IS filter");
          value = value === "null" ? null : value === "true";
        }
        if (match[2] === "in") {
          if (!match[3].startsWith("(") || !match[3].endsWith(")")) throw new Error("Invalid IN filter");
          value = match[3].length > 2 ? split(match[3].slice(1, -1)).map(unquote) : [];
        }
        return predicate(match[1], match[2], value);
      }).join(` ${join} `)})`;
      const where = this.filters.length ? ` WHERE ${this.filters.map((filter) => "expression" in filter ? logic(filter.expression) : `${filter.negate ? "NOT " : ""}(${predicate(filter.column, filter.operator, filter.value)})`).join(" AND ")}` : "";
      const order = this.orders.length ? ` ORDER BY ${this.orders.map((entry) => `${column(entry.column, true)} ${entry.ascending === false ? "DESC" : "ASC"}${entry.nullsFirst === undefined ? "" : entry.nullsFirst ? " NULLS FIRST" : " NULLS LAST"}`).join(",")}` : "";
      const pagination = `${this.take === undefined ? "" : ` LIMIT ${bind(this.take)}`}${this.skip ? ` OFFSET ${bind(this.skip)}` : ""}`;
      const table = `public.${ident(this.table)}`;
      let prefix = "", source: string, scalarSet = false;
      if (this.operation === "rpc") {
        const args = Object.fromEntries(Object.entries(this.rpcArgs || {}).filter(([, value]) => value !== undefined));
        const signatures = await this.execute(`SELECT p.pronargs,p.pronargdefaults,p.proargnames,p.proretset,
          (rt.typtype='c' OR rt.typname='record') AS composite,
          ARRAY(SELECT format_type(oid,NULL) FROM unnest(p.proargtypes::oid[]) AS oid) AS argtypes
          FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
          JOIN pg_catalog.pg_type rt ON rt.oid=p.prorettype
          WHERE n.nspname='public' AND p.proname=$1 AND p.prokind='f'`, [this.table], { signal: this.signal });
        const matches = signatures.filter((signature) => {
          const names = (signature.proargnames || []).slice(0, signature.pronargs);
          return Object.keys(args).every((key) => names.includes(key)) && names.slice(0, signature.pronargs - signature.pronargdefaults).every((key: string) => key in args);
        });
        if (matches.length !== 1) throw Object.assign(new Error(matches.length ? "Ambiguous RPC signature" : "RPC signature not found"), { code: matches.length ? "PGRST203" : "PGRST202" });
        const signature = matches[0];
        const call = `${table}(${Object.entries(args).map(([key, value]) => {
          const type = signature.argtypes[signature.proargnames.indexOf(key)];
          return `${ident(key)} => ${bind((type === "json" || type === "jsonb") && value !== null ? JSON.stringify(value) : value)}::${type}`;
        }).join(",")})`;
        if (!signature.composite && !signature.proretset) {
          if (this.filters.length || this.orders.length || this.take !== undefined || this.skip || this.projection !== "*") throw new Error("Unsupported scalar RPC transform");
          const rows = await this.execute(`SELECT ${call} AS data`, params, { signal: this.signal });
          await this.afterCommit?.();
          return { data: this.head ? null : rows[0]?.data ?? null, error: null, count: null, status: 200, statusText: "OK" };
        }
        scalarSet = !signature.composite;
        source = `SELECT t.* FROM ${call} AS t${scalarSet ? "(value)" : ""}${where}`;
      } else if (this.operation === "select") {
        source = `SELECT t.*${[...relations.entries()].map(([alias, relation]) => `,CASE WHEN ${relation.alias} IS NULL THEN NULL ELSE jsonb_build_object(${relation.fields}) END AS ${ident(alias)}`).join("")} FROM ${table} AS t ${[...relations.values()].map((relation) => relation.join).join(" ")}${where}`;
      } else {
        if (relations.size || this.orders.length || this.take !== undefined || this.skip) throw new Error("Unsupported mutation transform");
        let mutation: string;
        if (this.operation === "delete") mutation = `DELETE FROM ${table} AS t${where}`;
        else {
          const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
          if (!rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Mutation requires nonempty records");
          const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => row[key] !== undefined)))];
          if (!keys.length) throw new Error("Empty mutation unsupported");
          keys.forEach(ident);
          if (this.operation === "update") {
            if (rows.length !== 1) throw new Error("Update requires one record");
            const record = `jsonb_populate_record(NULL::${table},${bind(JSON.stringify(rows[0]))}::jsonb)`;
            mutation = `UPDATE ${table} AS t SET ${keys.map((key) => `${ident(key)}=(${record}).${ident(key)}`).join(",")}${where}`;
          } else {
            if (this.filters.length) throw new Error("Insert filters unsupported");
            if (this.options.defaultToNull === false && rows.some((row) => keys.some((key) => row[key] === undefined))) throw new Error("Mixed records with defaults unsupported");
            mutation = `INSERT INTO ${table} AS t (${keys.map(ident).join(",")}) SELECT ${keys.map(ident).join(",")} FROM jsonb_populate_recordset(NULL::${table},${bind(JSON.stringify(rows))}::jsonb)`;
            if (this.operation === "upsert") {
              let conflicts: string[];
              if (this.options.onConflict) conflicts = split(this.options.onConflict);
              else {
                const pk = await this.execute(`SELECT a.attname FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY a.attnum`, [`public.${this.table}`], { signal: this.signal });
                conflicts = pk.map((row) => row.attname);
                if (!conflicts.length) throw new Error("Upsert requires conflict target");
              }
              mutation += ` ON CONFLICT (${conflicts.map(ident).join(",")}) ${this.options.ignoreDuplicates ? "DO NOTHING" : `DO UPDATE SET ${keys.map((key) => `${ident(key)}=EXCLUDED.${ident(key)}`).join(",")}`}`;
            }
          }
        }
        prefix = `changed AS (${mutation} RETURNING t.*),`;
        source = "SELECT * FROM changed AS t";
      }
      const guard = this.cardinality ? `,CASE WHEN (SELECT count(*) FROM page) ${this.cardinality === "single" ? "=1" : "<=1"} THEN 1 ELSE ('__clawdeals_cardinality_'||(SELECT count(*) FROM page))::integer END AS cardinality_guard` : "";
      const omit = this.head || (this.operation !== "select" && this.operation !== "rpc" && !this.returning);
      const aggregate = omit ? "NULL::jsonb" : "COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb)";
      const rows = await this.execute(`WITH ${prefix}filtered AS (${source}),page AS (SELECT ${fields} FROM filtered AS t${order}${pagination}) SELECT ${aggregate} AS data${this.countMode ? ",(SELECT count(*) FROM filtered) AS count" : ""}${guard}`, params, { signal: this.signal });
      if (this.operation !== "select") await this.afterCommit?.();
      const raw = rows[0]?.data ?? [];
      const data = scalarSet ? raw.map((row: any) => row.value) : raw;
      return { data: omit ? null : this.cardinality ? data[0] ?? null : data, error: null, count: this.countMode ? Number(rows[0]?.count || 0) : null, status: 200, statusText: "OK" };
    } catch (error: any) {
      const cardinality = error?.code === "22P02" && String(error?.message).includes("__clawdeals_cardinality_");
      // Composite-field lookup emits different wording from a plain missing
      // column. Preserve SQLSTATE/details while keeping existing service fallback
      // detection compatible. Do not normalize other messages or error classes.
      const rawMessage = error?.message || String(error);
      const message = error?.code === "42703" && typeof rawMessage === "string"
        ? rawMessage.replace(/^column ("(?:[^"\r\n]|"")+") not found in data type ([^\r\n]+)$/, "column $1 does not exist in data type $2")
        : rawMessage;
      return { data: null, count: null, error: { message: cardinality ? "JSON object requested, multiple (or no) rows returned" : message, code: cardinality ? "PGRST116" : error?.code || "NEON_ADAPTER_ERROR", details: error?.detail || null, hint: error?.hint || null }, status: cardinality ? 406 : 400, statusText: cardinality ? "Not Acceptable" : "Bad Request" };
    }
  }
}
async function runtimeQuery(sql: string, params: unknown[], options?: { signal?: AbortSignal }) {
  await ensureNeonRuntimeRole();
  return getNeonSql().query(sql, params, { fetchOptions: { signal: options?.signal } });
}
export function createNeonDataClient(execute: NeonExecutor = runtimeQuery) {
  const afterCommit = execute === runtimeQuery ? async () => {
    try {
      const { wakeNeonQueuesAfterCommit } = await import("../services/neon-queue-wake");
      await wakeNeonQueuesAfterCommit();
    } catch { console.warn("queue.neon_wake_unavailable"); }
  } : undefined;
  return { from: (table: string) => new NeonQuery(execute, table, undefined, afterCommit), rpc: (name: string, args: Record<string, unknown> = {}) => new NeonQuery(execute, name, args, afterCommit) };
}
let client: ReturnType<typeof createNeonDataClient> | undefined;
export function getNeonDataClient() { return client ??= createNeonDataClient(); }
