import { describe, expect, it } from "vitest";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import frMessages from "../../../messages/fr.json";
import { PUBLIC_RATE_LIMITS } from "../../pages/guides/mcp-marketplace-safety";
import {
  getProfileForGroup,
  RATE_LIMIT_DEFAULT_SCOPE
} from "../../server/rate-limit/config";

describe("MCP marketplace safety guide", () => {
  it("keeps its public rate-limit examples aligned with the API configuration", () => {
    for (const publicLimit of PUBLIC_RATE_LIMITS) {
      const profile = getProfileForGroup(publicLimit.route);

      expect(profile, publicLimit.route).not.toBeNull();
      expect(profile.buckets, publicLimit.route).toEqual(publicLimit.buckets);
      expect(profile.scope || RATE_LIMIT_DEFAULT_SCOPE, publicLimit.route).toBe(publicLimit.scope);
    }
  });

  it("provides localized SEO and technical table copy in every supported locale", () => {
    const messages = [enMessages, frMessages, esMessages];

    for (const localeMessages of messages) {
      expect(localeMessages.seo.guides.mcpSafety.title.length).toBeLessThanOrEqual(60);
      expect(localeMessages.seo.guides.mcpSafety.description.length).toBeGreaterThanOrEqual(110);
      expect(localeMessages.seo.guides.mcpSafety.description.length).toBeLessThanOrEqual(160);
      expect(localeMessages.guides.mcpSafety.technical.auditTable.header).toBeTruthy();
      expect(localeMessages.guides.mcpSafety.technical.rateTable.routeGroup).toBeTruthy();
      expect(localeMessages.guides.mcpSafety.technical.idempotencyCode.firstCall).toBeTruthy();
    }

    expect(frMessages.guides.mcpSafety.technical.auditTable.header).toBe("En-tête");
    expect(esMessages.guides.mcpSafety.technical.rateTable.routeGroup).toBe("Grupo de rutas");
    expect(frMessages.guides.mcpSafety.description).not.toContain("audit trail");
    expect(esMessages.guides.mcpSafety.description).not.toContain("rate limits");
  });
});
