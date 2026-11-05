import { describe, expect, it } from "vitest";
import { fixturePort, fixturePortKeys } from "./loopback-fixture";

describe("confined fixture port configuration", () => {
  it("keeps ephemeral ports by default", () => {
    for (const key of fixturePortKeys) expect(fixturePort(key, {})).toBe(0);
  });
  it("accepts distinct explicit ports including the range boundaries", () => {
    const env = Object.fromEntries(fixturePortKeys.map((key, i) => [key, String([1024, 48192, 48193, 65535][i])]));
    expect(fixturePort(fixturePortKeys[0], env)).toBe(1024);
    expect(fixturePort(fixturePortKeys[3], env)).toBe(65535);
  });
  it.each(["", "0", "1023", "65536", "-1", "1.5", "1e4", " 48191", "48191 ", "048191", "NaN", "999999999999999999999"])("rejects invalid port %j", (value) => {
    expect(() => fixturePort(fixturePortKeys[0], { [fixturePortKeys[0]]: value })).toThrow("integer port");
  });
  it("rejects duplicates anywhere in the four-port configuration", () => {
    expect(() => fixturePort(fixturePortKeys[0], {
      [fixturePortKeys[1]]: "48192", [fixturePortKeys[2]]: "48192"
    })).toThrow("distinct");
  });
  it("validates other fixture overrides before any listener starts", () => {
    expect(() => fixturePort(fixturePortKeys[0], { [fixturePortKeys[3]]: "bad" })).toThrow("integer port");
  });
});
