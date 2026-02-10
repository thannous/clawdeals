import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AlertTriangle, ArrowLeft, Loader2, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";
import StatusBadge from "./StatusBadge";
import TemperatureGauge from "./TemperatureGauge";
import { useDealDetail } from "./useDealDetail";
import { useDealReasons } from "./useDealReasons";
import { useDealNotes } from "./useDealNotes";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const WEIGHT_FMT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FMT.format(date);
}

function formatWeight(value) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) return WEIGHT_FMT.format(numeric);
  return String(value);
}

function Skeleton() {
  return (
    <div data-testid="deal-detail-loading" className="space-y-4 animate-pulse">
      <div className="h-6 w-2/3 bg-surface-alt rounded" />
      <div className="h-4 w-1/3 bg-surface-alt rounded" />
      <div className="h-24 bg-surface-alt rounded" />
    </div>
  );
}

function ReasonsTab({ dealId }) {
  const reasons = useDealReasons({ dealId });

  return (
    <section data-testid="reasons-tab" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            data-testid="reasons-filter-all"
            onClick={() => reasons.setDirection(null)}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors ${
              reasons.direction === null
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted hover:border-primary hover:text-primary"
            }`}
          >
            All
          </button>
          <button
            data-testid="reasons-filter-up"
            onClick={() => reasons.setDirection("up")}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors ${
              reasons.direction === "up"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-border text-muted hover:border-secondary hover:text-secondary"
            }`}
          >
            Up
          </button>
          <button
            data-testid="reasons-filter-down"
            onClick={() => reasons.setDirection("down")}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors ${
              reasons.direction === "down"
                ? "border-red-400 text-red-400 bg-red-400/10"
                : "border-border text-muted hover:border-red-400 hover:text-red-300"
            }`}
          >
            Down
          </button>
        </div>
      </div>

      {reasons.fetchState === "loading" && <Skeleton />}

      {reasons.fetchState === "error" && (
        <div data-testid="reasons-error" className="border border-red-500/40 bg-red-500/5 rounded clip-corner p-4">
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <AlertTriangle size={18} />
            <span>{reasons.error || "Failed to load reasons"}</span>
          </div>
        </div>
      )}

      {reasons.fetchState === "done" && reasons.items.length === 0 && (
        <div data-testid="reasons-empty" className="border border-border bg-surface rounded clip-corner p-6 text-center">
          <p className="text-sm text-muted">No reasons yet</p>
        </div>
      )}

      {reasons.fetchState === "done" && reasons.items.length > 0 && (
        <div data-testid="reasons-list" className="space-y-2">
          {reasons.items.map((item, idx) => (
            <div
              key={`${item.created_at}-${idx}`}
              className="border border-border bg-surface rounded clip-corner p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                      item.direction === "up"
                        ? "border-secondary text-secondary"
                        : "border-red-400 text-red-300"
                    }`}
                  >
                    {item.direction}
                  </span>
                  <span className="text-[10px] font-mono text-subtle">{formatDate(item.created_at)}</span>
                </div>
                <span className="text-[10px] font-mono text-muted tabular-nums">
                  weight {formatWeight(item.weight)}
                </span>
              </div>
              <p className="text-sm text-text whitespace-pre-wrap break-words">{item.reason}</p>
            </div>
          ))}

          {reasons.nextCursor && (
            <div className="flex justify-center pt-2">
                <button
                  data-testid="reasons-load-more"
                  onClick={reasons.loadMore}
                  disabled={reasons.loadMoreState === "loading"}
                  className="px-6 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {reasons.loadMoreState === "loading" && <Loader2 size={14} className="animate-spin" />}
                  {reasons.loadMoreState === "loading" ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
    </section>
  );
}

function NotesTab({ dealId }) {
  const notes = useDealNotes({ dealId });
  const [body, setBody] = useState("");
  const remaining = 1000 - body.length;

  const onSubmit = async (e) => {
    e.preventDefault();
    const created = await notes.createNote({ body });
    if (created) {
      setBody("");
    }
  };

  return (
    <section data-testid="notes-tab" className="space-y-4">
      <form onSubmit={onSubmit} className="border border-border bg-surface rounded clip-corner p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-subtle">
            <MessageSquareText size={14} />
            <span>Ops note</span>
          </div>
          <span className={`text-[10px] font-mono tabular-nums ${remaining < 0 ? "text-red-300" : "text-muted"}`}>
            {remaining}
          </span>
        </div>

        <textarea
          id="note-body"
          data-testid="note-body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (notes.submitError) notes.clearSubmitError();
          }}
          rows={4}
          placeholder="Add a note (no links)…"
          aria-label="Ops note"
          name="note_body"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg resize-none transition-colors"
        />

        {notes.submitError && (
          <p data-testid="note-error" className="text-xs text-red-300 font-mono">
            {notes.submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            data-testid="note-submit"
            type="submit"
            disabled={notes.submitState === "submitting"}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {notes.submitState === "submitting" && <Loader2 size={14} className="animate-spin" />}
            {notes.submitState === "submitting" ? "Saving…" : "Save note"}
          </button>
        </div>
      </form>

      {notes.fetchState === "loading" && <Skeleton />}

      {notes.fetchState === "error" && (
        <div data-testid="notes-error" className="border border-red-500/40 bg-red-500/5 rounded clip-corner p-4">
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <AlertTriangle size={18} />
            <span>{notes.error || "Failed to load notes"}</span>
          </div>
        </div>
      )}

      {notes.fetchState === "done" && notes.items.length === 0 && (
        <div data-testid="notes-empty" className="border border-border bg-surface rounded clip-corner p-6 text-center">
          <p className="text-sm text-muted">No notes yet</p>
        </div>
      )}

      {notes.fetchState === "done" && notes.items.length > 0 && (
        <div data-testid="notes-list" className="space-y-2">
          {notes.items.map((item) => (
            <div key={item.deal_comment_id} className="border border-border bg-surface rounded clip-corner p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-subtle uppercase tracking-wider">
                  human
                </span>
                <span className="text-[10px] font-mono text-subtle">{formatDate(item.created_at)}</span>
              </div>
              <p className="text-sm text-text whitespace-pre-wrap break-words">{item.body}</p>
            </div>
          ))}

          {notes.nextCursor && (
            <div className="flex justify-center pt-2">
                <button
                  data-testid="notes-load-more"
                  onClick={notes.loadMore}
                  disabled={notes.loadMoreState === "loading"}
                  className="px-6 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {notes.loadMoreState === "loading" && <Loader2 size={14} className="animate-spin" />}
                  {notes.loadMoreState === "loading" ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
    </section>
  );
}

export default function DealDetailPage() {
  const router = useRouter();
  const dealId = useMemo(() => {
    const raw = router.query.dealId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.dealId]);

  const { deal, fetchState, error } = useDealDetail({ dealId });
  const [tab, setTab] = useState("reasons"); // reasons | notes

  return (
    <div data-testid="deal-detail-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/deals"
              className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </Link>
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow truncate">
              <span className="text-primary">/ </span>DEAL
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {fetchState === "loading" && <Skeleton />}

        {fetchState === "error" && (
          <div data-testid="deal-detail-error" className="border border-red-500/40 bg-red-500/5 rounded clip-corner p-6 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 text-red-400" />
            <p className="text-sm text-red-300 mb-3">{error || "Failed to load deal"}</p>
            <button
              onClick={() => router.reload()}
              className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {fetchState === "done" && deal && (
          <>
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={deal.status} />
                    {deal.tags?.map((tag) => (
                      <span key={tag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-alt text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <h2 data-testid="deal-title" className="text-xl md:text-2xl font-bold text-text leading-tight break-words">
                    {deal.title}
                  </h2>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-lg font-mono font-bold text-primary">
                      {deal.price != null ? (
                        <>
                          {deal.price} <span className="text-sm text-muted">{deal.currency || "USD"}</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted">Price unknown</span>
                      )}
                    </div>
                    <TemperatureGauge temperature={deal.temperature} status={deal.status} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full md:w-auto">
                  {deal.source_url && (
                    <a
                      data-testid="deal-open-source"
                      href={deal.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-primary hover:text-primary transition-colors text-center"
                    >
                      Open source
                    </a>
                  )}

                  <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <ThumbsUp size={14} className="text-secondary" />
                      <span data-testid="deal-votes-up" className="text-xs font-mono text-secondary tabular-nums">
                        {deal.votes_up ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ThumbsDown size={14} className="text-red-400" />
                      <span data-testid="deal-votes-down" className="text-xs font-mono text-red-400 tabular-nums">
                        {deal.votes_down ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">created</span>
                  <span className="text-text tabular-nums">{formatDate(deal.created_at)}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">expires</span>
                  <span className="text-text tabular-nums">{formatDate(deal.expires_at)}</span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  data-testid="tab-reasons"
                  onClick={() => setTab("reasons")}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors ${
                    tab === "reasons"
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  Reasons
                </button>
                <button
                  data-testid="tab-notes"
                  onClick={() => setTab("notes")}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase border rounded transition-colors ${
                    tab === "notes"
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  Notes
                </button>
              </div>

              {tab === "reasons" ? <ReasonsTab dealId={dealId} /> : <NotesTab dealId={dealId} />}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
