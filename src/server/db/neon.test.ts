import { afterEach, describe, expect, it } from "vitest";

import { getNeonSql, resetNeonSqlForTests } from "./neon";

afterEach(() => {
  delete process.env.DATABASE_URL;
  resetNeonSqlForTests();
});

describe("getNeonSql", () => {
  it("does not require Neon configuration until the client is used", () => {
    expect(() => getNeonSql()).toThrow("Missing required env var: DATABASE_URL");
  });

  it("returns one lazily-created query client", () => {
    process.env.DATABASE_URL = "postgresql://user:password@example.test/clawdeals";
    const first = getNeonSql();
    expect(getNeonSql()).toBe(first);
  });
});
