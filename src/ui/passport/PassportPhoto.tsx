import Image, { type ImageLoaderProps } from "next/image";
import type { PassportPhoto as Photo } from "./passport-types";

const photoLoader = ({ src }: ImageLoaderProps) => src;

export default function PassportPhoto({ photo, label }: { photo: Photo; label: string }) {
  return (
    <a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={label} className="relative block aspect-[4/3] w-full overflow-hidden rounded border border-border bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <Image loader={photoLoader} unoptimized fill src={photo.url} alt={label} className="object-contain" />
    </a>
  );
}
