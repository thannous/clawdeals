import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readMessages(locale: "en" | "fr" | "es") {
  const fullPath = join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

describe("browseDeals i18n", () => {
  it("defines noPriceListed in en/fr/es", () => {
    const locales: Array<"en" | "fr" | "es"> = ["en", "fr", "es"];

    for (const locale of locales) {
      const messages = readMessages(locale);
      const value = messages?.browseDeals?.noPriceListed;
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
