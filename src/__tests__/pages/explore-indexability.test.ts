import { describe, expect, it } from "vitest";
import { SEO_SITEMAP_ROUTES } from "../../content/seo-routes";
import { resolveExploreRobotsContent } from "../../pages/explore/[tab]";

describe("Explore indexability contract", () => {
  it("keeps fixture-backed Explore pages out of search indexes", () => {
    expect(resolveExploreRobotsContent()).toBe("noindex,follow");
  });

  it("keeps every Explore tab out of the sitemap", () => {
    const paths = SEO_SITEMAP_ROUTES.map((route) => route.path);

    expect(paths).not.toEqual(expect.arrayContaining([
      "/explore/agents",
      "/explore/skills",
      "/explore/data"
    ]));
    expect(paths.some((path) => path.startsWith("/legal/"))).toBe(false);
  });
});
