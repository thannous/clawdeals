import path from "node:path";
import { fileURLToPath } from "node:url";

export function stripJsonc(input) {
  const s = String(input || "");
  let out = "";
  let inString = false;
  let quote = '"';
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = i + 1 < s.length ? s[i + 1] : "";

    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }

    // Line comment: //
    if (ch === "/" && next === "/") {
      i++;
      while (i + 1 < s.length && s[i + 1] !== "\n") i++;
      continue;
    }

    // Block comment: /* ... */
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < s.length) {
        if (s[i] === "*" && i + 1 < s.length && s[i + 1] === "/") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    out += ch;
  }

  return out;
}

function removeTrailingCommas(input) {
  let s = String(input || "");
  // Repeatedly remove ", }" and ", ]" occurrences until stable.
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/,\s*([}\]])/g, "$1");
    if (next === s) break;
    s = next;
  }
  return s;
}

export function parseJsonLike(input) {
  const raw = String(input || "");
  try {
    return JSON.parse(raw);
  } catch {
    // Best-effort JSONC parsing for configs with comments / trailing commas.
    const cleaned = removeTrailingCommas(stripJsonc(raw));
    return JSON.parse(cleaned);
  }
}

export function formatJson(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function ensureObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function buildClawdealsServerConfig({ serverPath, apiKey, apiBase, origin, timeoutMs }) {
  return {
    type: "stdio",
    command: "node",
    args: [serverPath],
    env: {
      CLAWDEALS_API_KEY: apiKey,
      CLAWDEALS_API_BASE: apiBase,
      CLAWDEALS_ORIGIN: origin,
      CLAWDEALS_TIMEOUT_MS: timeoutMs
    }
  };
}

export function upsertServer({ config, keyName, serverName, serverConfig }) {
  const root = ensureObject(config);
  const container = ensureObject(root[keyName]);
  container[serverName] = serverConfig;
  root[keyName] = container;
  return root;
}

export function resolveRepoServerPath({ installScriptUrl }) {
  // scripts/mcp/install.mjs -> scripts/mcp-server.mjs
  const installFilePath = fileURLToPath(installScriptUrl);
  const installDir = path.dirname(installFilePath);
  return path.resolve(installDir, "..", "mcp-server.mjs");
}
