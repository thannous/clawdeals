import { describe, expect, it } from "vitest";

import { sniffImageMime, stripJpegExif } from "./media";

function hexToBuf(hex: string) {
  return Buffer.from(hex.replace(/\s+/g, ""), "hex");
}

describe("telegram/media", () => {
  it("sniffImageMime detects jpeg/png/webp", () => {
    const jpeg = hexToBuf("ffd8ffe000104a4649460001");
    expect(sniffImageMime(jpeg)).toBe("image/jpeg");

    const png = hexToBuf("89504e470d0a1a0a00000000");
    expect(sniffImageMime(png)).toBe("image/png");

    const webp = Buffer.from("RIFF0000WEBP", "ascii");
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("sniffImageMime returns null for unknown", () => {
    expect(sniffImageMime(Buffer.from("not-an-image"))).toBeNull();
  });

  it("stripJpegExif removes APP1 Exif segment (best-effort)", () => {
    // Minimal JPEG:
    // SOI
    // APP1 length=16, payload starts with "Exif\\0\\0"
    // APP0 length=4 (dummy)
    // EOI
    const soi = hexToBuf("ffd8");
    const app1 =
      Buffer.concat([
        hexToBuf("ffe1"),
        hexToBuf("000e"),
        hexToBuf("457869660000"),
        hexToBuf("000000000000") // pad
      ]);
    const app0 = hexToBuf("ffe00004dead");
    const eoi = hexToBuf("ffd9");

    const input = Buffer.concat([soi, app1, app0, eoi]);
    const out = stripJpegExif(input);

    expect(out.equals(Buffer.concat([soi, app0, eoi]))).toBe(true);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);
  });
});
