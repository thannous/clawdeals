import { describe, expect, it } from "vitest";
import { SEO_SITEMAP_ROUTES } from "../../content/seo-routes";
import { resolveExploreRobotsContent } from "../../pages/explore/[tab]";

describe("Explore indexability contract", () => {
  it("keeps canonical marketing pages indexable and preview responses noindex", () => {
    expect(resolveExploreRobotsContent(false)).toBe(
      "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    );
    expect(resolveExploreRobotsContent(true)).toBe("noindex,follow");
  });

  it("publishes every Explore tab in the sitemap without publishing legal pages", () => {
    const paths = SEO_SITEMAP_ROUTES.map((route) => route.path);

    expect(paths).toEqual(expect.arrayContaining([
      "/explore/agents",
      "/explore/skills",
      "/explore/data"
    ]));
    expect(paths.some((path) => path.startsWith("/legal/"))).toBe(false);
  });
});
