import { useSyncExternalStore } from "react";

export type ComparisonSelection = { listing_id: string; title: string };
export const COMPARISON_SELECTION_KEY = "clawdeals:smartphone-comparison:v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY: ComparisonSelection[] = [];
let snapshot: ComparisonSelection[] = EMPTY;
let expiresAt = 0;
let loaded = false;
const listeners = new Set<() => void>();

function validSelection(value: unknown): value is ComparisonSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as ComparisonSelection;
  return typeof item.listing_id === "string" && UUID.test(item.listing_id) && typeof item.title === "string" && item.title.length <= 240 && !/[\u0000-\u001f]/.test(item.title);
}
function publish(items: ComparisonSelection[]) {
  if (JSON.stringify(items) === JSON.stringify(snapshot)) return;
  snapshot = items.length ? items : EMPTY;
  for (const listener of listeners) listener();
}
function load() {
  if (typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(COMPARISON_SELECTION_KEY);
    if (!raw) { expiresAt = 0; publish(EMPTY); return; }
    const saved = JSON.parse(raw);
    const now = Date.now();
    if (saved?.version !== 1 || !Number.isFinite(saved.expires_at) || saved.expires_at <= now || saved.expires_at > now + TTL_MS || !Array.isArray(saved.items) || saved.items.length > 3 || !saved.items.every(validSelection) || new Set(saved.items.map((item: ComparisonSelection) => item.listing_id.toLowerCase())).size !== saved.items.length) {
      window.sessionStorage.removeItem(COMPARISON_SELECTION_KEY);
      expiresAt = 0;
      publish(EMPTY);
      return;
    }
    expiresAt = saved.expires_at;
    publish(saved.items.map(({ listing_id, title }: ComparisonSelection) => ({ listing_id: listing_id.toLowerCase(), title })));
  } catch {
    // Keep this tab usable when browser storage is disabled. No passport data,
    // notes or photos are ever stored here.
    if (expiresAt <= Date.now()) publish(EMPTY);
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) load();
  if (listeners.size === 1) window.addEventListener("focus", load);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener("focus", load); };
}
function getSnapshot() { return snapshot; }
function getServerSnapshot() { return EMPTY; }

export function useComparisonSelection() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
export function replaceComparisonSelection(items: ComparisonSelection[]) {
  if (typeof window === "undefined") return;
  if (items.length > 3 || !items.every(validSelection) || new Set(items.map((item) => item.listing_id.toLowerCase())).size !== items.length) return;
  loaded = true;
  expiresAt = Date.now() + TTL_MS;
  const safe = items.map(({ listing_id, title }) => ({ listing_id: listing_id.toLowerCase(), title }));
  try {
    if (safe.length) window.sessionStorage.setItem(COMPARISON_SELECTION_KEY, JSON.stringify({ version: 1, expires_at: expiresAt, items: safe }));
    else window.sessionStorage.removeItem(COMPARISON_SELECTION_KEY);
  } catch { /* Memory state remains available for this tab. */ }
  publish(safe);
}
export function removeComparisonSelection(id: string) {
  if (!loaded) load();
  replaceComparisonSelection(snapshot.filter((item) => item.listing_id !== id.toLowerCase()));
}
export function toggleComparisonSelection(item: ComparisonSelection): "added" | "removed" | "limit" | "invalid" {
  if (!loaded || expiresAt <= Date.now()) load();
  if (!validSelection(item)) return "invalid";
  const normalized = { ...item, listing_id: item.listing_id.toLowerCase() };
  if (snapshot.some((entry) => entry.listing_id === normalized.listing_id)) {
    removeComparisonSelection(normalized.listing_id);
    return "removed";
  }
  if (snapshot.length >= 3) return "limit";
  replaceComparisonSelection([...snapshot, normalized]);
  return "added";
}
