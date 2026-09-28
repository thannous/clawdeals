import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ogHandler from "../../pages/api/og";

describe("Spanish Open Graph image", () => {
  it("ships a 1200x630 Spanish PNG and maps the OG endpoint to it", () => {
    const png = readFileSync(`${process.cwd()}/public/og/es.png`);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);

    const setHeader = vi.fn();
    const redirect = vi.fn();
    ogHandler({ query: { locale: "es" } } as never, { setHeader, redirect } as never);

    expect(redirect).toHaveBeenCalledWith(302, "/og/es.png");
  });
});
