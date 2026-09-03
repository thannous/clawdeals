import { describe, expect, it } from "vitest";
import { SEO_SITEMAP_ROUTES } from "../../content/seo-routes";
import { getServerSideProps as getExploreTabProps } from "../../pages/explore/[tab]";
import { getServerSideProps as getExploreIndexProps } from "../../pages/explore";

describe("Explore indexability contract", () => {
  it("redirects the Explore index and tabs to the localized homepage", async () => {
    await expect(getExploreIndexProps({ locale: "en" } as any)).resolves.toEqual({
      redirect: { destination: "/", permanent: true }
    });
    await expect(getExploreTabProps({ locale: "fr", params: { tab: "skills" } } as any)).resolves.toEqual({
      redirect: { destination: "/fr/", permanent: true }
    });
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
