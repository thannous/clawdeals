/** Split pg_dump SQL without interpreting quoted bodies or COPY data as commands.
 * This is deliberately not a general SQL authorization parser. */
export function splitSqlStatements(input) {
  const sql = String(input), chunks = [];
  let start = 0, i = 0, quote = null, dollar = null, comment = 0;
  while (i < sql.length) {
    if (comment) {
      if (sql.slice(i, i + 2) === "/*") { comment++; i += 2; }
      else if (sql.slice(i, i + 2) === "*/") { comment--; i += 2; }
      else i++;
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) { i += dollar.length; dollar = null; } else i++;
      continue;
    }
    if (quote) {
      if (sql[i] === quote) {
        if (sql[i + 1] === quote) i += 2;
        else { quote = null; i++; }
      } else if (quote === "'" && sql[i] === "\\") {
        // Fail closed: backslash string escapes depend on session settings.
        throw new Error("Backslash SQL string escapes require reviewed normalization");
      } else i++;
      continue;
    }
    if (sql.slice(i, i + 2) === "--") {
      const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; continue;
    }
    if (sql.slice(i, i + 2) === "/*") { comment = 1; i += 2; continue; }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i++]; continue; }
    const tag = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];
    if (tag) { dollar = tag; i += tag.length; continue; }
    if (sql[i] === "\\") throw new Error("psql metacommands are not permitted");
    if (sql[i] !== ";") { i++; continue; }
    const text = sql.slice(start, ++i);
    if (/^COPY\s/i.test(stripComments(text).trim()) && /\bFROM\s+stdin\s*;\s*$/i.test(text)) {
      if (sql[i] === "\r") i++;
      if (sql[i] !== "\n") throw new Error("COPY data must start on next line");
      const dataStart = ++i;
      let end = i;
      while (end < sql.length) {
        const nl = sql.indexOf("\n", end), stop = nl < 0 ? sql.length : nl;
        if (sql.slice(end, stop).replace(/\r$/, "") === "\\.") {
          chunks.push({ sql: text, data: sql.slice(dataStart, end), copy: true, text: sql.slice(start, nl < 0 ? stop : nl + 1) });
          i = nl < 0 ? stop : nl + 1; start = i; break;
        }
        if (nl < 0) throw new Error("Unterminated COPY data");
        end = nl + 1;
      }
      if (start !== i) throw new Error("Unterminated COPY data");
    } else { chunks.push({ sql: text, text, copy: false }); start = i; }
  }
  if (quote || dollar || comment) throw new Error("Unterminated SQL construct");
  if (stripComments(sql.slice(start)).trim()) throw new Error("Unterminated SQL statement");
  return chunks;
}

export function stripComments(sql) {
  // Used only for statement classification. It never changes executed SQL.
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function inspectImportSql(sql) {
  const blockers = [];
  let chunks;
  try { chunks = splitSqlStatements(sql); } catch (error) { return [error.message]; }
  for (const chunk of chunks) {
    const text = stripComments(chunk.sql).trim();
    if (/\b(?:neon_auth|auth|storage|realtime|vault|cron|net)\s*\./i.test(text)) blockers.push("provider schema reference");
    if (/\b(?:dblink|http|pg_notify|notify|pg_read_file|pg_write_file|lo_import|lo_export|query_to_xml)\b/i.test(text)) blockers.push("outbound or external side effect");
    if (/\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE)\b)/i.test(text)) blockers.push("dynamic SQL needs reviewed rewrite");
    if (/\bU&["']/i.test(text)) blockers.push("escaped SQL identifier");
    if (/^(?:BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE|DO|CALL|GRANT|REVOKE|DROP|TRUNCATE|DELETE|UPDATE|INSERT|LOAD|VACUUM|ALTER\s+(?:SYSTEM|ROLE|USER|DATABASE|DEFAULT))\b/i.test(text)) blockers.push("unsafe transaction or administrative statement");
    const allowed = /^(?:CREATE\s+(?:(?:OR\s+REPLACE)\s+)?(?:SCHEMA|TABLE|SEQUENCE|INDEX|UNIQUE\s+INDEX|VIEW|FUNCTION|PROCEDURE|TYPE|TRIGGER)|ALTER\s+(?:TABLE|SEQUENCE|FUNCTION|PROCEDURE|VIEW|TYPE)|COMMENT\s+ON|COPY\s|SET\s|SELECT\s)/i.test(text);
    if (!allowed) blockers.push("unsupported statement");
    if (/^SET\b/i.test(text) && !/^SET\s+(?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security|default_tablespace|default_table_access_method)\s*=\s*(?:'[^']*'|[a-z0-9_]+)\s*;$/i.test(text)) blockers.push("unsafe session setting");
    if (/^SET\s+standard_conforming_strings/i.test(text) && !/=\s*'?(?:on|true)'?\s*;/i.test(text)) blockers.push("unsafe string parsing");
    if (/^SELECT\b/i.test(text) && !/^SELECT\s+pg_catalog\.(?:set_config\('search_path',\s*'',\s*false\)|setval\('[a-zA-Z0-9_."]+',\s*\d+,\s*(?:true|false)\))\s*;$/i.test(text)) blockers.push("top-level function execution");
    if (/\bLANGUAGE\s+(?!'?(?:sql|plpgsql)'?\b)/i.test(text)) blockers.push("external routine language");
    if (/^COPY\b/i.test(text) && !chunk.copy) blockers.push("Only COPY FROM stdin is permitted");
    if (chunk.copy && !/^COPY\s+(?:public|private)\.[\s\S]+\bFROM\s+stdin\s*;$/i.test(text)) blockers.push("COPY must target application schema stdin");
  }
  return [...new Set(blockers)];
}
