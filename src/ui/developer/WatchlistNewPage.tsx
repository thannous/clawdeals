import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { apiRequest } from "./api";
import { getStoredApiKey } from "./storage";

function parseTags(input: string): string[] {
  return String(input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function WatchlistNewPage() {
  const [apiKey] = useState<string | null>(() => getStoredApiKey());
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!apiKey) return false;
    if (status === "loading") return false;
    const hasQuery = Boolean(query.trim());
    const hasTags = parseTags(tags).length > 0;
    const hasPrice = Boolean(String(priceMax || "").trim());
    return hasQuery || hasTags || hasPrice;
  }, [apiKey, query, tags, priceMax, status]);

  const handleSubmit = useCallback(async () => {
    if (!apiKey) {
      setStatus("error");
      setMessage("Missing API key. Go to /start.");
      return;
    }

    setStatus("loading");
    setMessage("");
    setCreatedId(null);

    const criteria: any = {
      query: query.trim() || null,
      tags: parseTags(tags)
    };

    const rawPrice = String(priceMax || "").trim();
    if (rawPrice) {
      const n = Number(rawPrice);
      if (!Number.isFinite(n) || n <= 0) {
        setStatus("error");
        setMessage("price_max must be a positive number.");
        return;
      }
      criteria.price_max = n;
    }

    try {
      const result = await apiRequest<any>({
        path: "/v1/watchlists",
        method: "POST",
        apiKey,
        body: {
          name: null,
          active: true,
          criteria
        }
      });
      const watchlistId = result.data?.watchlist_id || null;
      setCreatedId(watchlistId);
      setStatus("success");
      setMessage("Watchlist created.");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Failed to create watchlist.");
    }
  }, [apiKey, query, tags, priceMax]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-bold tracking-wider">
            <span className="text-primary">/ </span>WATCHLIST NEW
          </div>
          <div className="flex gap-2">
            <Link href="/developer" className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong">
              Dashboard
            </Link>
            <Link href="/developer/events" className="border border-primary px-3 py-1 text-xs font-mono text-primary hover:bg-primary hover:text-bg">
              Events
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="border border-border bg-surface p-6 space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-subtle">Criteria</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="query">
                Query (AND tokens)
              </label>
              <input
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="rtx 4070"
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
                disabled={status === "loading"}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="tags">
                Tags (comma)
              </label>
              <input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="gpu,nvidia"
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
                disabled={status === "loading"}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="price-max">
                Price max (EUR)
              </label>
              <input
                id="price-max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="500"
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
                disabled={status === "loading"}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`h-11 px-6 font-bold uppercase tracking-wider text-xs border border-primary ${
                canSubmit ? "bg-primary text-bg hover:bg-text" : "bg-surface-alt text-subtle cursor-not-allowed"
              }`}
              data-testid="create-watchlist"
            >
              Create
            </button>
            {createdId && (
              <span className="text-xs font-mono text-subtle">
                watchlist_id: <span className="text-text">{createdId}</span>
              </span>
            )}
          </div>

          {message && (
            <div
              className={`text-xs font-mono ${
                status === "error" ? "text-red-400" : status === "success" ? "text-emerald-400" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {message}
            </div>
          )}
        </div>

        {!apiKey && (
          <div className="border border-border bg-bg p-5 text-xs font-mono text-subtle">
            Missing API key. Go to <Link href="/start" className="text-primary hover:underline">/start</Link>.
          </div>
        )}
      </main>
    </div>
  );
}
