export type MediaImage = {
  storage_key: string;
  mime: string;
  w?: number;
  h?: number;
};

export type ReadMediaShape = {
  images: MediaImage[] | null;
  cover_image_index: number | null;
  cover_image: MediaImage | null;
  images_count: number;
};

const MAX_IMAGES = 8;

function assertPositiveInteger(value: unknown, fieldName: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseImageStrict(entry: unknown, fieldName: string): MediaImage {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${fieldName} must be an object`);
  }

  const storageKey = normalizeString((entry as any).storage_key);
  if (!storageKey) {
    throw new Error(`${fieldName}.storage_key is required`);
  }

  const mime = normalizeString((entry as any).mime);
  if (!mime) {
    throw new Error(`${fieldName}.mime is required`);
  }

  const w = (entry as any).w;
  const h = (entry as any).h;

  if (w !== undefined && w !== null) {
    assertPositiveInteger(w, `${fieldName}.w`);
  }
  if (h !== undefined && h !== null) {
    assertPositiveInteger(h, `${fieldName}.h`);
  }

  return {
    storage_key: storageKey,
    mime,
    ...(w != null ? { w } : {}),
    ...(h != null ? { h } : {})
  };
}

function parseImageLoose(entry: unknown): MediaImage | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const storageKey = normalizeString((entry as any).storage_key);
  const mime = normalizeString((entry as any).mime);
  if (!storageKey || !mime) {
    return null;
  }

  const w = (entry as any).w;
  const h = (entry as any).h;

  const validW =
    typeof w === "number" &&
    Number.isFinite(w) &&
    Number.isSafeInteger(w) &&
    w > 0
      ? w
      : undefined;

  const validH =
    typeof h === "number" &&
    Number.isFinite(h) &&
    Number.isSafeInteger(h) &&
    h > 0
      ? h
      : undefined;

  return {
    storage_key: storageKey,
    mime,
    ...(validW != null ? { w: validW } : {}),
    ...(validH != null ? { h: validH } : {})
  };
}

export function parseImagesStrict(value: unknown, fieldName = "images"): MediaImage[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (value.length > MAX_IMAGES) {
    throw new Error(`${fieldName} must contain 0..${MAX_IMAGES} images`);
  }

  const normalized: MediaImage[] = [];
  for (let idx = 0; idx < value.length; idx += 1) {
    normalized.push(parseImageStrict(value[idx], `${fieldName}[${idx}]`));
  }
  return normalized;
}

export function normalizeImagesForRead(value: unknown): MediaImage[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry) => parseImageLoose(entry))
    .filter((entry): entry is MediaImage => Boolean(entry));
  return normalized;
}

export function areMediaImagesEqual(left: MediaImage[] | null, right: MediaImage[] | null): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;

  for (let idx = 0; idx < left.length; idx += 1) {
    const a = left[idx];
    const b = right[idx];
    if (
      a.storage_key !== b.storage_key ||
      a.mime !== b.mime ||
      (a.w ?? null) !== (b.w ?? null) ||
      (a.h ?? null) !== (b.h ?? null)
    ) {
      return false;
    }
  }

  return true;
}

export function parseListingsImagesInput({
  images,
  photos
}: {
  images: unknown;
  photos: unknown;
}): {
  hasImages: boolean;
  hasPhotos: boolean;
  images: MediaImage[] | null;
} {
  const hasImages = images !== undefined;
  const hasPhotos = photos !== undefined;

  let parsedImages: MediaImage[] | null = null;
  let parsedPhotos: MediaImage[] | null = null;

  if (hasImages) {
    parsedImages = parseImagesStrict(images, "images");
  }
  if (hasPhotos) {
    parsedPhotos = parseImagesStrict(photos, "photos");
  }

  if (hasImages && hasPhotos && !areMediaImagesEqual(parsedImages, parsedPhotos)) {
    throw new Error("images and photos must match when both are provided");
  }

  return {
    hasImages,
    hasPhotos,
    images: hasImages ? parsedImages : hasPhotos ? parsedPhotos : null
  };
}

export function parseCoverImageIndex(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new Error("cover_image_index must be an integer");
  }
  return value;
}

export function resolveCoverImageIndexForWrite({
  images,
  coverImageIndex,
  hasExplicitCoverField
}: {
  images: MediaImage[] | null;
  coverImageIndex: number | null;
  hasExplicitCoverField: boolean;
}): number | null {
  const list = Array.isArray(images) ? images : null;

  if (!list || list.length === 0) {
    if (hasExplicitCoverField && coverImageIndex !== null) {
      throw new Error("cover_image_index must be null when images is empty");
    }
    return null;
  }

  if (!hasExplicitCoverField || coverImageIndex === null) {
    return 0;
  }

  if (coverImageIndex < 0 || coverImageIndex >= list.length) {
    throw new Error("cover_image_index is out of bounds");
  }

  return coverImageIndex;
}

export function resolveCoverImageIndexForRead({
  images,
  coverImageIndex
}: {
  images: MediaImage[] | null;
  coverImageIndex: unknown;
}): number | null {
  const list = Array.isArray(images) ? images : null;
  if (!list || list.length === 0) {
    return null;
  }

  if (
    typeof coverImageIndex === "number" &&
    Number.isFinite(coverImageIndex) &&
    Number.isSafeInteger(coverImageIndex) &&
    coverImageIndex >= 0 &&
    coverImageIndex < list.length
  ) {
    return coverImageIndex;
  }

  return 0;
}

export function resolveCoverImage({
  images,
  coverImageIndex
}: {
  images: MediaImage[] | null;
  coverImageIndex: number | null;
}): MediaImage | null {
  const list = Array.isArray(images) ? images : null;
  if (!list || list.length === 0) return null;
  if (typeof coverImageIndex !== "number") return null;
  if (coverImageIndex < 0 || coverImageIndex >= list.length) return null;
  return list[coverImageIndex] || null;
}

export function normalizeReadMedia({
  rawImages,
  rawCoverImageIndex
}: {
  rawImages: unknown;
  rawCoverImageIndex: unknown;
}): ReadMediaShape {
  const images = normalizeImagesForRead(rawImages);
  const cover_image_index = resolveCoverImageIndexForRead({ images, coverImageIndex: rawCoverImageIndex });
  const cover_image = resolveCoverImage({ images, coverImageIndex: cover_image_index });
  return {
    images,
    cover_image_index,
    cover_image,
    images_count: Array.isArray(images) ? images.length : 0
  };
}

export function getMediaMaxImages() {
  return MAX_IMAGES;
}
