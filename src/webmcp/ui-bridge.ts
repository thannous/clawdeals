import { ActionReceiptStore, type ActionReceipt } from "./activity/action-receipts";

export type ListingsFilter = {
  q?: string;
  category?: string;
  condition?: string;
  price_min?: number;
  price_max?: number;
  sort?: string;
  highlight_ids?: string[];
};

export type DealsFilter = {
  q?: string;
  sort?: string;
  status?: string;
  highlight_ids?: string[];
};

export type BuyMissionView = {
  mission_id: string;
  status: "ACTIVE";
  query: string;
  preferred_price_max: number | null;
  hard_budget_max: number;
  currency: string;
  requirements: string[];
  autonomous_actions: string[];
  contact_reveal: "manual_bilateral_approval";
  expires_at: string;
  location: {
    label: string | null;
    lat: number;
    lon: number;
    radius_km: number;
  };
};

export type WebMcpUiCommand =
  | { type: "filter_listings"; filter: ListingsFilter }
  | { type: "highlight_listings"; ids: string[] }
  | { type: "filter_deals"; filter: DealsFilter }
  | { type: "highlight_deals"; ids: string[] }
  | { type: "navigate"; href: string }
  | { type: "mission_created"; mission: BuyMissionView }
  | { type: "activity"; receipt: ActionReceipt };

const EVENT = "clawdeals:webmcp-ui";

const activityListeners = new Set<() => void>();
let actionReceiptStore: ActionReceiptStore | null = null;
let actionReceipts: ActionReceipt[] = [];
const missionListeners = new Set<() => void>();
let activeBuyMission: BuyMissionView | null = null;

function emitActivity() {
  for (const listener of activityListeners) listener();
}

function ensureActionReceiptStore(): ActionReceiptStore {
  if (actionReceiptStore) return actionReceiptStore;
  let storage: Storage | null = null;
  if (typeof window !== "undefined") {
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
  }
  actionReceiptStore = new ActionReceiptStore({ storage });
  actionReceipts = actionReceiptStore.list();
  return actionReceiptStore;
}

export function hydrateWebMcpActionReceipts() {
  const previous = actionReceipts;
  ensureActionReceiptStore();
  if (actionReceipts !== previous) emitActivity();
}

export function getWebMcpActionReceipts(): ActionReceipt[] {
  return actionReceipts;
}

export function subscribeWebMcpActionReceipts(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

export function clearWebMcpActionReceipts() {
  ensureActionReceiptStore().clear();
  actionReceipts = [];
  emitActivity();
}

export function getActiveBuyMission(): BuyMissionView | null {
  return activeBuyMission;
}

export function subscribeActiveBuyMission(listener: () => void): () => void {
  missionListeners.add(listener);
  return () => {
    missionListeners.delete(listener);
  };
}

export function applyBuyMissionUi(mission: BuyMissionView) {
  activeBuyMission = mission;
  for (const listener of missionListeners) listener();
  publishWebMcpUi({ type: "mission_created", mission });
}

export function clearActiveBuyMission() {
  if (activeBuyMission === null) return;
  activeBuyMission = null;
  for (const listener of missionListeners) listener();
}

export function recordWebMcpActionReceipt(receipt: ActionReceipt): ActionReceipt {
  const stored = ensureActionReceiptStore().upsert(receipt);
  actionReceipts = actionReceiptStore?.list() || [stored];
  emitActivity();
  publishWebMcpUi({ type: "activity", receipt: stored });
  return stored;
}

export function getWebMcpActionReceipt(query: {
  receiptId?: string;
  requestId?: string;
}): ActionReceipt | null {
  const store = ensureActionReceiptStore();
  if (query.receiptId) return store.getByReceiptId(query.receiptId);
  if (query.requestId) return store.getByRequestId(query.requestId);
  return null;
}

export function publishWebMcpUi(command: WebMcpUiCommand) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: command }));
}

export function subscribeWebMcpUi(handler: (command: WebMcpUiCommand) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as WebMcpUiCommand | undefined;
    if (!detail || typeof detail !== "object") return;
    handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function getPageContext() {
  if (typeof window === "undefined") {
    return { path: "", title: "", query: {}, href: "" };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    path: window.location.pathname,
    href: window.location.href,
    title: typeof document !== "undefined" ? document.title : "",
    query: Object.fromEntries(params.entries())
  };
}

function currentPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

export function listingsHref(filter: ListingsFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", String(filter.q));
  if (filter.category) params.set("category", String(filter.category));
  if (filter.condition) params.set("condition", String(filter.condition));
  if (filter.price_min != null) params.set("price_min", String(filter.price_min));
  if (filter.price_max != null) params.set("price_max", String(filter.price_max));
  if (filter.sort && filter.sort !== "recent") params.set("sort", String(filter.sort));
  const qs = params.toString();
  return qs ? `/browse?${qs}` : "/browse";
}

export function dealsHref(filter: DealsFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", String(filter.q));
  if (filter.status) params.set("status", String(filter.status));
  if (filter.sort && filter.sort !== "new") params.set("sort", String(filter.sort));
  const qs = params.toString();
  return qs ? `/browse/deals?${qs}` : "/browse/deals";
}

function onListingsSurface(path: string): boolean {
  return path === "/webmcp" || path.startsWith("/webmcp/") || path === "/browse" || (path.startsWith("/browse/") && !path.startsWith("/browse/deals"));
}

function onDealsSurface(path: string): boolean {
  return path === "/browse/deals" || path.startsWith("/browse/deals/") || path === "/deals" || path.startsWith("/deals/");
}

export function applyListingsSearchUi(filter: ListingsFilter) {
  const path = currentPath();
  publishWebMcpUi({ type: "filter_listings", filter });
  if (filter.highlight_ids?.length) {
    publishWebMcpUi({ type: "highlight_listings", ids: filter.highlight_ids });
  }
  if (!onListingsSurface(path)) {
    publishWebMcpUi({ type: "navigate", href: listingsHref(filter) });
  }
}

export function applyDealsSearchUi(filter: DealsFilter) {
  const path = currentPath();
  publishWebMcpUi({ type: "filter_deals", filter });
  if (filter.highlight_ids?.length) {
    publishWebMcpUi({ type: "highlight_deals", ids: filter.highlight_ids });
  }
  if (!onDealsSurface(path) && path !== "/webmcp" && !path.startsWith("/webmcp/")) {
    publishWebMcpUi({ type: "navigate", href: dealsHref(filter) });
  }
}

export function applyOpenListingUi(listingId: string) {
  publishWebMcpUi({ type: "highlight_listings", ids: [listingId] });
  publishWebMcpUi({ type: "navigate", href: `/browse/${encodeURIComponent(listingId)}` });
}

export function applyOpenDealUi(dealId: string) {
  publishWebMcpUi({ type: "highlight_deals", ids: [dealId] });
  publishWebMcpUi({ type: "navigate", href: `/browse/deals/${encodeURIComponent(dealId)}` });
}
