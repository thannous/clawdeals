import { describe, expect, it } from "vitest";

import { loadExploreCopy } from "./loadExploreCopy";

describe("loadExploreCopy", () => {
  it("loads native Spanish copy for an es-ES locale", async () => {
    const copy = await loadExploreCopy("es-ES");

    expect(copy.hero.gig.title).toBe("DESPLIEGUE DE AGENTES TÁCTICOS");
    expect(copy.waitlist.title).toContain("lista de espera");
    expect(copy.actions.deploy).toBe("Desplegar");
    expect(copy.hero.gig.description).not.toContain("Rent specialized agents");
  });

  it("keeps English as the fallback for unsupported locales", async () => {
    const copy = await loadExploreCopy("de-DE");

    expect(copy.hero.gig.title).toBe("TACTICAL AGENT DEPLOYMENT");
  });
});
