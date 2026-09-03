const STORAGE_KEY = "clawdeals.followed_listings:v1";
const MAX_FOLLOWED = 200;

type Listener = () => void;

const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedIds: readonly string[] = [];

function readRaw(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Stable snapshot for `useSyncExternalStore`: same reference while storage is unchanged. */
export function getFollowedListingIds(): readonly string[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = parse(raw);
  }
  return cachedIds;
}

export function getServerFollowedListingIds(): readonly string[] {
  return [];
}

function write(ids: readonly string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_FOLLOWED)));
  } catch {
    // Private browsing or quota: following is best-effort.
  }
  listeners.forEach((listener) => listener());
}

export function isListingFollowed(listingId: string): boolean {
  return getFollowedListingIds().includes(listingId);
}

export function toggleFollowedListing(listingId: string): boolean {
  const current = getFollowedListingIds();
  const next = current.includes(listingId) ? current.filter((id) => id !== listingId) : [...current, listingId];
  write(next);
  return next.includes(listingId);
}

export function subscribeFollowedListings(listener: Listener) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
