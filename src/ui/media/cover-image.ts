import { isRetiredSupabaseLocator } from "../../shared/media/retired-storage";

function resolveEnv(name: string): string {
  const raw = process.env?.[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveCoverImageSrc(image: any): string | null {
  const storageKey = typeof image?.storage_key === "string" ? image.storage_key.trim() : "";
  if (!storageKey) return null;
  // This public selector is compiled into the browser bundle, like auth routing.
  const neon = process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND?.trim().toLowerCase() === "neon";
  if (neon && isRetiredSupabaseLocator(storageKey)) return null;

  if (
    storageKey.startsWith("/") ||
    storageKey.startsWith("http://") ||
    storageKey.startsWith("https://")
  ) {
    return storageKey;
  }

  if (neon) return null;

  const supabaseUrl = resolveEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl) return null;

  const bucket = resolveEnv("NEXT_PUBLIC_LISTING_PHOTOS_BUCKET") || "listing-photos";
  const normalizedBaseUrl = supabaseUrl.replace(/\/+$/, "");
  const normalizedKey = storageKey.replace(/^\/+/, "");
  const encodedKey = encodePathSegments(normalizedKey);
  if (!encodedKey) return null;

  return `${normalizedBaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedKey}`;
}
