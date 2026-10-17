import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
const globRequire = createRequire(pluginRequire.resolve("fast-glob"));
const matcherRequire = createRequire(globRequire.resolve("micromatch"));
const braces = matcherRequire("braces");
const nested = "{".repeat(4990) + "x" + "}".repeat(4990);
let fixture: string;
const roots = (rootDir?: unknown) => getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir } } });

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), "clawdeals-braces-"));
  for (const path of ["alpha/pages", "beta/src/pages", ".hidden/pages", "space name/pages"]) mkdirSync(join(fixture, path), { recursive: true });
  writeFileSync(join(fixture, "file.txt"), "not a directory");
  writeFileSync(join(fixture, "alpha/pages/about.js"), "export default function About() { return null; }");
  symlinkSync(join(fixture, "alpha"), join(fixture, "linked"), "dir");
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe("braces recursion fix through the installed Next.js lint dependency", () => {
  it("uses exactly the tracked fork even with linked verification dependencies", () => {
    const installed = dirname(matcherRequire.resolve("braces"));
    const source = resolve("tools/braces");
    for (const file of ["index.js", "package.json", "LICENSE", ...readdirSync(join(source, "lib")).map(file => `lib/${file}`)]) {
      expect(readFileSync(join(installed, file), "utf8")).toBe(readFileSync(join(source, file), "utf8"));
    }
  });

  it.each([nested, `!${nested}`, ["src", nested], "{a,b}" + "(".repeat(4990) + "x" + ")".repeat(4990)])("rejects deep root patterns explicitly before recursion", rootDir => {
    expect(() => roots(rootDir)).toThrowError(expect.objectContaining({ name: "SyntaxError", code: "ERR_BRACES_DEPTH" }));
  });

  it.each(["compile", "expand", "stringify"])("also bounds direct AST input to %s", method => {
    let ast: any = { type: "text", value: "x" };
    for (let depth = 0; depth < 4990; depth++) ast = { type: "root", nodes: [ast] };
    expect(() => braces[method](ast)).toThrowError(expect.objectContaining({ name: "SyntaxError", code: "ERR_BRACES_DEPTH" }));
    const cycle: any = { type: "root", nodes: [] };
    cycle.nodes.push(cycle);
    expect(() => braces[method](cycle)).toThrowError(expect.objectContaining({ code: "ERR_BRACES_DEPTH" }));
  });

  it("preserves ordinary expansions, literal escaping and parser limits", () => {
    expect(braces.expand("apps/{alpha,beta}/{1..2}")).toEqual(["apps/alpha/1", "apps/alpha/2", "apps/beta/1", "apps/beta/2"]);
    expect(braces.expand("\\{literal\\}")).toEqual(["{literal}"]);
    expect(braces.stringify(braces.parse("apps/{alpha,beta}"))).toBe("apps/{alpha,beta}");
    expect(braces.compile("{alpha,beta}")).toBe("(alpha|beta)");
    expect(() => braces.parse("a".repeat(10001))).toThrow(SyntaxError);
    expect(() => braces.expand("{1..10000}")).toThrow(RangeError);
    expect(() => braces.compile(nested, { maxDepth: Infinity, maxLength: Infinity })).toThrowError(expect.objectContaining({ code: "ERR_BRACES_DEPTH" }));
  });

  it("validates iterable and indexed AST children used by the original walkers", () => {
    for (const method of ["compile", "stringify", "expand"]) {
      const container = (child: unknown) => method === "expand" ? { 0: child, length: 1 } : new Set([child]);
      expect(braces[method]({ type: "root", nodes: container({ type: "text", value: "x" }) })).toEqual(method === "expand" ? ["x"] : "x");
      let ast: any = { type: "text", value: "x" };
      for (let depth = 0; depth < 4990; depth++) ast = { type: "root", nodes: container(ast) };
      expect(() => braces[method](ast)).toThrowError(expect.objectContaining({ code: "ERR_BRACES_DEPTH" }));
    }
  });

  it("keeps one-shot iterables intact and checks indexed children even with an iterator", () => {
    for (const method of ["compile", "stringify"]) {
      const nodes = (function* () { yield { type: "text", value: "x" }; })();
      expect(braces[method]({ type: "root", nodes })).toBe("x");
    }
    let ast: any = { type: "text", value: "x" };
    for (let depth = 0; depth < 4990; depth++) ast = { type: "root", nodes: { 0: ast, length: 1, *[Symbol.iterator]() {} } };
    expect(() => braces.expand(ast)).toThrowError(expect.objectContaining({ code: "ERR_BRACES_DEPTH" }));
    const stringify = require(join(dirname(matcherRequire.resolve("braces")), "lib/stringify.js"));
    expect(() => stringify({ type: "text", value: "x" }, {}, -Infinity)).toThrowError(expect.objectContaining({ code: "ERR_BRACES_DEPTH" }));
  });

  it("retains literal, absolute, wildcard, brace and symlink root directories", () => {
    expect(roots()).toEqual([process.cwd()]);
    expect(roots(fixture)).toEqual([fixture]);
    expect(roots(`${fixture}/linked/`)).toEqual([`${fixture}/linked/`]);
    expect(roots(`${fixture}/*`).sort()).toEqual(["alpha", "beta", "linked", "space name"].map(name => `${fixture}/${name}`).sort());
    expect(roots(`${fixture}/{alpha,beta}`).sort()).toEqual([`${fixture}/alpha`, `${fixture}/beta`]);
    expect(roots([`${fixture}/alpha`, null, 7, `${fixture}/beta`])).toEqual([`${fixture}/alpha`, `${fixture}/beta`]);
    expect(roots(`${fixture}/missing`)).toEqual([]);
  });

  it("still enforces Next.js internal-link linting with a configured root", async () => {
    const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
      files: ["**/*.jsx"],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { next: pluginRequire("./index.js") },
      settings: { next: { rootDir: `${fixture}/{alpha,beta}` } },
      rules: { "next/no-html-link-for-pages": "error" }
    }] });
    const [invalid] = await lint.lintText('const page = <a href="/about">About</a>;', { filePath: "security-fixture.jsx" });
    expect(invalid.messages.map(message => message.ruleId)).toContain("next/no-html-link-for-pages");
    const [valid] = await lint.lintText('const page = <a href="https://example.com/about">About</a>;', { filePath: "security-fixture.jsx" });
    expect(valid.errorCount).toBe(0);
  });
});
