import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const LEGACY_ODR_URL = "https://ec.europa.eu/consumers/odr";
const LEGAL_CONTENT_DIR = path.join(process.cwd(), "src/ui/legal");
const TERMS_PAGE_SOURCE = path.join(process.cwd(), "src/pages/legal/terms.tsx");
const LOCALIZED_LEGAL_SOURCES = fs
  .readdirSync(LEGAL_CONTENT_DIR)
  .filter((file) => /-content\.(?:en|fr|es)\.tsx$/.test(file));

const ACTIVE_TERMS_SOURCES = [
  {
    file: "terms-content.en.tsx",
    closureText: "discontinued on 20 July 2025",
    consumerRedressUrl:
      "https://europa.eu/youreurope/citizens/consumers/consumers-dispute-resolution/index_en.htm",
  },
  {
    file: "terms-content.fr.tsx",
    closureText: "supprimée le 20 juillet 2025",
    consumerRedressUrl:
      "https://europa.eu/youreurope/citizens/consumers/consumers-dispute-resolution/index_fr.htm",
  },
  {
    file: "terms-content.es.tsx",
    closureText: "suprimida el 20 de julio de 2025",
    consumerRedressUrl:
      "https://europa.eu/youreurope/citizens/consumers/consumers-dispute-resolution/index_es.htm",
  },
] as const;

describe("legal terms ODR references", () => {
  it("records the date of this legal-content update", () => {
    const source = fs.readFileSync(TERMS_PAGE_SOURCE, "utf8");

    expect(source).toContain('const LAST_UPDATED = "2026-08-06"');
  });

  it.each(ACTIVE_TERMS_SOURCES)(
    "replaces the discontinued ODR platform in $file",
    ({ file, closureText, consumerRedressUrl }) => {
      const source = fs.readFileSync(path.join(LEGAL_CONTENT_DIR, file), "utf8");
      const normalizedSource = source.replace(/\s+/g, " ");

      expect(source).not.toContain(LEGACY_ODR_URL);
      expect(normalizedSource).toContain(closureText);
      expect(source).toContain(consumerRedressUrl);
    },
  );

  it("keeps the consolidated legacy source free of the discontinued URL", () => {
    const source = fs.readFileSync(path.join(LEGAL_CONTENT_DIR, "terms-content.tsx"), "utf8");

    expect(source).not.toContain(LEGACY_ODR_URL);
    for (const { consumerRedressUrl } of ACTIVE_TERMS_SOURCES) {
      expect(source).toContain(consumerRedressUrl);
    }
  });
});

describe("localized legal content encoding", () => {
  it.each(LOCALIZED_LEGAL_SOURCES)("contains valid UTF-8 text in %s", (file) => {
    const source = fs.readFileSync(path.join(LEGAL_CONTENT_DIR, file), "utf8");

    expect(source).not.toMatch(/[ÃÂ]|�|â(?:€|•|”|“)/);
  });
});
