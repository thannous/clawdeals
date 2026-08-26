import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("Next.js response headers", () => {
  it("requests origin-keyed agent clusters consistently for the whole origin", async () => {
    const config = require("../../next.config.js");
    const rules = await config.headers();

    expect(rules).toContainEqual({
      source: "/(.*)",
      headers: [{ key: "Origin-Agent-Cluster", value: "?1" }]
    });
  });
});
