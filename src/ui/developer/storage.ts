const API_KEY_STORAGE_KEY = "clawdeals_api_key";
const SSE_LAST_EVENT_ID_KEY = "clawdeals_sse_last_event_id";
const API_KEY_CHANGE_EVENT = "clawdeals:api-key-change";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function getStoredApiKey(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  const value = storage.getItem(API_KEY_STORAGE_KEY);
  return value ? String(value) : null;
}

export function setStoredApiKey(apiKey: string) {
  const storage = safeStorage();
  if (!storage) return;
  if (!apiKey) return;
  storage.setItem(API_KEY_STORAGE_KEY, String(apiKey));
  window.dispatchEvent(new Event(API_KEY_CHANGE_EVENT));
}

export function clearStoredApiKey() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(API_KEY_STORAGE_KEY);
  window.dispatchEvent(new Event(API_KEY_CHANGE_EVENT));
}

export function subscribeStoredApiKey(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === API_KEY_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(API_KEY_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(API_KEY_CHANGE_EVENT, listener);
  };
}

export function getStoredLastEventId(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  const value = storage.getItem(SSE_LAST_EVENT_ID_KEY);
  return value ? String(value) : null;
}

export function setStoredLastEventId(lastEventId: string) {
  const storage = safeStorage();
  if (!storage) return;
  if (!lastEventId) return;
  storage.setItem(SSE_LAST_EVENT_ID_KEY, String(lastEventId));
}

export function clearStoredLastEventId() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(SSE_LAST_EVENT_ID_KEY);
}
