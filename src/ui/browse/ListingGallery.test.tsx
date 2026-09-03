import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("/")}` : key
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- test double for next/image
  default: ({ src, alt }: any) => <img src={typeof src === "string" ? src : ""} alt={alt} />
}));

import ListingGallery, { resolveGallerySources } from "./ListingGallery";

const photos = [
  { storage_key: "https://cdn.example.com/a.jpg" },
  { storage_key: "https://cdn.example.com/b.jpg" },
  { storage_key: "https://cdn.example.com/c.jpg" }
];

describe("resolveGallerySources", () => {
  it("puts the cover first and de-duplicates", () => {
    expect(resolveGallerySources({ images: photos, cover_image: photos[1] })).toEqual([
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/c.jpg"
    ]);
  });

  it("falls back to photos and ignores unresolvable entries", () => {
    expect(resolveGallerySources({ photos: [{ storage_key: "" }, photos[0]] })).toEqual(["https://cdn.example.com/a.jpg"]);
    expect(resolveGallerySources({})).toEqual([]);
  });
});

describe("ListingGallery", () => {
  afterEach(cleanup);

  it("renders nothing without photos", () => {
    const { container } = render(<ListingGallery listing={{}} title="Lamp" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a single image without thumbnails", () => {
    render(<ListingGallery listing={{ cover_image: photos[0] }} title="Lamp" />);
    expect(screen.getByRole("img", { name: "Lamp" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("switches the main image from the thumbnails", () => {
    render(<ListingGallery listing={{ images: photos, cover_image: photos[0] }} title="Bike" />);
    expect(screen.getByRole("img", { name: "Bike" }).getAttribute("src")).toBe("https://cdn.example.com/a.jpg");
    expect(screen.getByText("1 / 3")).toBeTruthy();

    fireEvent.click(screen.getByTestId("listing-gallery-thumb-2"));

    expect(screen.getByRole("img", { name: "Bike" }).getAttribute("src")).toBe("https://cdn.example.com/c.jpg");
    expect(screen.getByRole("tab", { name: "gallery.photo:3/3" }).getAttribute("aria-selected")).toBe("true");
  });
});
