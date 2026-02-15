import { describe, expect, it } from "vitest";

import {
  extractClaimTokenFromPath,
  resolveSupportedLocale,
  splitLocalePrefix,
  stripLocalePrefix
} from "./i18n";

describe("shared i18n helpers", () => {
  it("resolves supported locales with fallback", () => {
    expect(resolveSupportedLocale("fr")).toBe("fr");
    expect(resolveSupportedLocale("es-ES")).toBe("es");
    expect(resolveSupportedLocale("unknown")).toBe("en");
    expect(resolveSupportedLocale(undefined)).toBe("en");
  });

  it("strips locale prefixes consistently", () => {
    expect(stripLocalePrefix("/fr/claim/abc")).toBe("/claim/abc");
    expect(stripLocalePrefix("/es/deals/1")).toBe("/deals/1");
    expect(stripLocalePrefix("/en")).toBe("/");
    expect(stripLocalePrefix("/claim/abc")).toBe("/claim/abc");
  });

  it("splits locale prefix and preserves rest path", () => {
    expect(splitLocalePrefix("/es/claim/token")).toEqual({
      locale: "es",
      localePrefix: "/es",
      rest: "/claim/token"
    });
    expect(splitLocalePrefix("/claim/token")).toEqual({
      locale: null,
      localePrefix: "",
      rest: "/claim/token"
    });
  });

  it("extracts claim token for en/fr/es paths", () => {
    expect(extractClaimTokenFromPath("/claim/cd_claim_1")).toBe("cd_claim_1");
    expect(extractClaimTokenFromPath("/fr/claim/cd_claim_2")).toBe("cd_claim_2");
    expect(extractClaimTokenFromPath("/es/claim/cd_claim_3")).toBe("cd_claim_3");
    expect(extractClaimTokenFromPath("/es/claim/%63%64%5Fclaim")).toBe("cd_claim");
    expect(extractClaimTokenFromPath("/es/claim/[token]")).toBe("");
    expect(extractClaimTokenFromPath("/es/start")).toBe("");
  });
});
