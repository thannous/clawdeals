import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const methods = new Set(["select", "insert", "update", "delete", "upsert", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike", "contains", "overlaps", "not", "or", "filter", "match", "order", "range", "limit", "single", "maybeSingle", "abortSignal"]);
const relationships = { watchlists: ["agents"], api_keys: ["agents"], agent_installations: ["agents", "owners"], agents: ["owners"] };
function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(name) : /\.[cm]?[jt]sx?$/.test(name) && !/\.test\./.test(name) ? [name] : [];
  });
}
function isDatabaseRoot(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const method = node.expression.name.text;
  const receiver = node.expression.expression.getText();
  if (!["from", "rpc"].includes(method)) return false;
  if (/^(Array|Buffer|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array)$/.test(receiver)) return false;
  if (/(^|\.)storage$/.test(receiver)) return false;
  return true;
}
export function auditQuerySurface(root = process.cwd()) {
  const files = ["src/server", "src/pages/api"].flatMap((dir) => filesUnder(path.join(root, dir)));
  const program = ts.createProgram(files, { noResolve: true, allowJs: true, target: ts.ScriptTarget.ESNext });
  const checker = program.getTypeChecker();
  const queries = [], projections = [], unsupported = [], dynamic = [], continuations = [];
  function literals(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen = new Set(seen).add(node);
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literals(node.expression, seen);
    if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue, seen), ...literals(node.whenFalse, seen)];
    if (ts.isIdentifier(node)) {
      const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
      return declaration && ts.isVariableDeclaration(declaration) ? literals(declaration.initializer, seen) : [];
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literals(node.left, seen), right = literals(node.right, seen);
      return left.flatMap((a) => right.map((b) => a + b));
    }
    return [];
  }
  function origin(node, seen = new Set()) {
    if (!node || seen.has(node)) return null;
    seen = new Set(seen).add(node);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (isDatabaseRoot(node)) return { kind: name, names: literals(node.arguments[0]), expression: node.arguments[0]?.getText() || "" };
      return origin(node.expression.expression, seen);
    }
    if (ts.isIdentifier(node)) {
      const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration && ts.isVariableDeclaration(declaration)) return origin(declaration.initializer, seen);
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return origin(node.expression, seen);
    return null;
  }
  for (const file of files) {
    const source = program.getSourceFile(file);
    const location = (node) => ({ file: path.relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text, where = location(node);
        if (isDatabaseRoot(node)) {
          const names = literals(node.arguments[0]);
          queries.push({ ...where, kind: name, names, expression: node.arguments[0]?.getText() || "" });
          if (!names.length) dynamic.push({ ...where, kind: name, expression: node.arguments[0]?.getText() || "" });
        }
        const base = origin(node.expression.expression);
        if (base) {
          continuations.push({ ...where, method: name, ...base });
          if (!methods.has(name)) unsupported.push({ ...where, method: name, reason: "unknown builder method" });
          if (["filter", "not"].includes(name)) {
            const operators = literals(node.arguments[1]);
            if (!operators.length) dynamic.push({ ...where, kind: "filter operator", expression: node.arguments[1]?.getText() || "" });
            for (const operator of operators) if (!["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "cs", "ov", "is", "in"].includes(operator)) unsupported.push({ ...where, method: name, operator, reason: "unsupported filter operator" });
          }
          const optionIndex = ["select", "order", "limit", "or"].includes(name) ? 1 : -1;
          const options = node.arguments[optionIndex];
          if (options && ts.isObjectLiteralExpression(options)) {
            for (const property of options.properties) {
              const key = property.name?.getText().replace(/["']/g, "");
              if (["foreignTable", "referencedTable"].includes(key) || (["or", "limit"].includes(name))) unsupported.push({ ...where, method: name, reason: "unsupported relation options", option: key });
              if (key === "count" && ts.isPropertyAssignment(property)) for (const mode of literals(property.initializer)) if (mode !== "exact") unsupported.push({ ...where, method: name, reason: "unsupported count mode", mode });
            }
          } else if (options) dynamic.push({ ...where, kind: "builder options", expression: options.getText() });

        }
        // Census all projections even when an injected/reassigned builder prevents
        // resolving its origin. Unknowns remain explicit review items, not passes.
        if (name === "select") {
          const selections = node.arguments.length ? literals(node.arguments[0]) : ["*"];
          projections.push({ ...where, selections, tables: base?.names || [], expression: node.arguments[0]?.getText() || "*" });
          if (!selections.length) dynamic.push({ ...where, kind: "projection", expression: node.arguments[0]?.getText() || "" });
          for (const selection of selections) {
            for (const match of selection.matchAll(/(?:^|,)\s*(?:\w+:)?(\w+)(?:!inner)?\s*\(/g)) {
              if (!base?.names.length) dynamic.push({ ...where, kind: "relationship origin", expression: match[1] });
              else for (const table of base.names) if (!relationships[table]?.includes(match[1])) unsupported.push({ ...where, reason: "unknown relationship", table, relation: match[1] });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { scope: ["src/server", "src/pages/api"], files: files.length, queries, continuations, projections, unsupported, dynamic, note: "Static source census only. Dynamic expressions and unresolved builders require review; this is not live schema parity or E2E coverage." };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditQuerySurface();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.unsupported.length) process.exitCode = 1;
}
