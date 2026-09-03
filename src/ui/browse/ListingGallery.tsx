import Image, { type ImageLoaderProps } from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { resolveCoverImageSrc } from "../media/cover-image";

const passthroughLoader = ({ src }: ImageLoaderProps) => src;

export function resolveGallerySources(listing: { images?: unknown; photos?: unknown; cover_image?: unknown }): string[] {
  const raw = Array.isArray(listing?.images) ? listing.images : Array.isArray(listing?.photos) ? listing.photos : [];
  const sources = raw.map((image) => resolveCoverImageSrc(image)).filter((src): src is string => Boolean(src));
  const cover = resolveCoverImageSrc(listing?.cover_image);
  const ordered = cover ? [cover, ...sources.filter((src) => src !== cover)] : sources;
  return [...new Set(ordered)];
}

/**
 * Cover image plus keyboard-navigable thumbnails. Falls back to a single image
 * (the previous behaviour) when the listing has only one photo.
 */
export default function ListingGallery({ listing, title }: { listing: any; title: string }) {
  const t = useTranslations("browse");
  const sources = resolveGallerySources(listing);
  const [index, setIndex] = useState(0);
  if (sources.length === 0) return null;
  const current = sources[Math.min(index, sources.length - 1)];

  return (
    <div className="space-y-2" data-testid="listing-gallery">
      <div className="relative w-full aspect-[16/10] border border-border overflow-hidden bg-surface">
        <Image loader={passthroughLoader} unoptimized fill src={current} alt={title} className="object-cover" />
        {sources.length > 1 ? (
          <span className="absolute bottom-2 right-2 bg-bg/80 border border-border px-2 py-0.5 text-[10px] font-mono text-muted">
            {index + 1} / {sources.length}
          </span>
        ) : null}
      </div>
      {sources.length > 1 ? (
        <div role="tablist" aria-label={t("gallery.label")} className="flex gap-2 overflow-x-auto pb-1">
          {sources.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t("gallery.photo", { index: i + 1, count: sources.length })}
              onClick={() => setIndex(i)}
              data-testid={`listing-gallery-thumb-${i}`}
              className={`relative h-16 w-20 shrink-0 border overflow-hidden transition-colors ${
                i === index ? "border-primary" : "border-border hover:border-border-strong"
              }`}
            >
              <Image loader={passthroughLoader} unoptimized fill src={src} alt="" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
