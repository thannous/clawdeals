import Link from "next/link";
import { useCallback, useMemo, useReducer } from "react";
import { useTranslations } from "next-intl";
import { apiRequest } from "./api";
import { getStoredApiKey } from "./storage";
import PageHeader from "../shared/PageHeader";

function parseTags(input: string): string[] {
  return String(input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

type WatchlistNewState = {
  query: string;
  tags: string;
  priceMax: string;
  status: "idle" | "loading" | "success" | "error";
  message: string;
  createdId: string | null;
};

type WatchlistNewAction = {
  type: "patch";
  patch: Partial<WatchlistNewState>;
};

const INITIAL_STATE: WatchlistNewState = {
  query: "",
  tags: "",
  priceMax: "",
  status: "idle",
  message: "",
  createdId: null
};

function watchlistNewReducer(state: WatchlistNewState, action: WatchlistNewAction): WatchlistNewState {
  if (action.type === "patch") {
    return { ...state, ...action.patch };
  }
  return state;
}

export default function WatchlistNewPage() {
  const t = useTranslations("watchlistNew");
  const apiKey = useMemo(() => getStoredApiKey(), []);
  const [state, dispatch] = useReducer(watchlistNewReducer, INITIAL_STATE);

  const canSubmit = useMemo(() => {
    if (!apiKey) return false;
    if (state.status === "loading") return false;
    const hasQuery = Boolean(state.query.trim());
    const hasTags = parseTags(state.tags).length > 0;
    const hasPrice = Boolean(String(state.priceMax || "").trim());
    return hasQuery || hasTags || hasPrice;
  }, [apiKey, state.query, state.tags, state.priceMax, state.status]);

  const handleSubmit = useCallback(async () => {
    if (!apiKey) {
      dispatch({
        type: "patch",
        patch: {
          status: "error",
          message: t("missingApiKey")
        }
      });
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        status: "loading",
        message: "",
        createdId: null
      }
    });

    const criteria: any = {
      query: state.query.trim() || null,
      tags: parseTags(state.tags)
    };

    const rawPrice = String(state.priceMax || "").trim();
    if (rawPrice) {
      const n = Number(rawPrice);
      if (!Number.isFinite(n) || n <= 0) {
        dispatch({
          type: "patch",
          patch: {
            status: "error",
            message: t("priceMaxValidation")
          }
        });
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
      dispatch({
        type: "patch",
        patch: {
          createdId: watchlistId,
          status: "success",
          message: t("created")
        }
      });
    } catch (error: any) {
      dispatch({
        type: "patch",
        patch: {
          status: "error",
          message: error?.message || t("createFailed")
        }
      });
    }
  }, [apiKey, state.query, state.tags, state.priceMax, t]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        title={t("pageTitle")}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/developer" className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong">
              Dashboard
            </Link>
            <Link
              href="/developer/events"
              className="border border-primary px-3 py-1 text-xs font-mono text-primary hover:bg-primary hover:text-bg"
            >
              Events
            </Link>
          </div>
        }
      />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-10 space-y-6">
        <div className="border border-border bg-surface p-6 space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-subtle">{t("criteria")}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="query">
                {t("queryLabel")}
              </label>
              <input
                id="query"
                value={state.query}
                onChange={(e) => dispatch({ type: "patch", patch: { query: e.target.value } })}
                placeholder="rtx 4070"
                name="query"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                disabled={state.status === "loading"}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="tags">
                {t("tagsLabel")}
              </label>
              <input
                id="tags"
                value={state.tags}
                onChange={(e) => dispatch({ type: "patch", patch: { tags: e.target.value } })}
                placeholder="gpu,nvidia"
                name="tags"
                autoComplete="off"
                spellCheck={false}
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                disabled={state.status === "loading"}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-subtle mb-2" htmlFor="price-max">
                {t("priceMaxLabel")}
              </label>
              <input
                id="price-max"
                value={state.priceMax}
                onChange={(e) => dispatch({ type: "patch", patch: { priceMax: e.target.value } })}
                placeholder="500"
                type="number"
                inputMode="numeric"
                name="price_max"
                autoComplete="off"
                className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                disabled={state.status === "loading"}
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
              {t("createButton")}
            </button>
            {state.createdId && (
              <span className="text-xs font-mono text-subtle">
                watchlist_id: <span className="text-text">{state.createdId}</span>
              </span>
            )}
          </div>

          {state.message && (
            <div
              className={`text-xs font-mono ${
                state.status === "error" ? "text-error" : state.status === "success" ? "text-success" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {state.message}
            </div>
          )}
        </div>

        {!apiKey && (
          <div className="border border-border bg-bg p-5 text-xs font-mono text-subtle">
            {t("missingApiKey")} <Link href="/start" className="text-primary hover:underline">/start</Link>.
          </div>
        )}
      </main>
    </div>
  );
}
