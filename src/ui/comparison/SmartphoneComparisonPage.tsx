import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { deriveComparison, parseComparisonIds, type ComparisonItem, type ComparisonPriority } from "../../lib/smartphone-comparison";
import { SMARTPHONE_CHECK_IDS } from "../../lib/smartphone-passport";
import { useTheme } from "../../theme/theme-context";
import { NavbarCurrent } from "../landing/Navbar";
import PassportPhoto from "../passport/PassportPhoto";
import SmartphoneMissionButton from "../my-missions/SmartphoneMissionButton";
import { failedComparisonItem, fetchComparisonItems } from "./comparison-client";
import { removeComparisonSelection, replaceComparisonSelection } from "./selection";

type Props = { initialIds: string[]; invalidIds: boolean; initialPriority: ComparisonPriority };
const priorities: ComparisonPriority[] = ["budget", "battery", "condition"];
const buttonClass = "rounded border border-border px-3 py-2 text-sm font-semibold text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

export default function SmartphoneComparisonPage({ initialIds, invalidIds, initialPriority }: Props) {
  const t = useTranslations("comparison");
  const p = useTranslations("passport");
  const b = useTranslations("browse");
  const locale = useLocale();
  const router = useRouter();
  const { themeId, setTheme, themes } = useTheme();
  const [ids, setIds] = useState(initialIds);
  const [invalid, setInvalid] = useState(invalidIds);
  const [priority, setPriority] = useState<ComparisonPriority>(initialPriority);
  const [items, setItems] = useState<ComparisonItem[]>([]);
  const [loading, setLoading] = useState(initialIds.length > 0);
  const [retryIds, setRetryIds] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<{ id: string; failed: boolean } | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const retries = useRef(new Map<string, AbortController>());
  const idKey = ids.join(",");

  useEffect(() => {
    if (!router.isReady) return;
    try {
      const next = router.query.ids === undefined ? [] : parseComparisonIds(router.query.ids);
      setIds((current) => current.join(",") === next.join(",") ? current : next);
      setInvalid(false);
    } catch { setIds([]); setInvalid(true); }
    setPriority(priorities.includes(router.query.priority as ComparisonPriority) ? router.query.priority as ComparisonPriority : "budget");
  }, [router.isReady, router.query.ids, router.query.priority]);

  useEffect(() => {
    const requestedIds = idKey ? idKey.split(",") : [];
    const controller = new AbortController();
    const retryRequests = retries.current;
    for (const retry of retryRequests.values()) retry.abort();
    retryRequests.clear();
    setRetryIds([]);
    setCopyState(null);
    if (!requestedIds.length) { setItems([]); setLoading(false); return; }
    setLoading(true);
    void fetchComparisonItems(requestedIds, controller.signal).then((next) => {
      if (!controller.signal.aborted) {
        setItems(next);
        replaceComparisonSelection(next.map((item) => ({ listing_id: item.listing_id, title: (item.listing?.title || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 240) })));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setItems(requestedIds.map(failedComparisonItem));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      for (const retry of retryRequests.values()) retry.abort();
    };
  }, [idKey]);

  const result = deriveComparison(items, priority);
  const busy = loading || retryIds.length > 0;
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const names = (id: string) => items.find((item) => item.listing_id === id)?.listing?.title || t("itemFallback");
  const missingPassports = items.some((item) => item.availability === "available" && (!item.passport || item.passport_error));

  function updateUrl(nextIds: string[], nextPriority: ComparisonPriority) {
    void router.replace({ pathname: "/browse/compare", query: { ...(nextIds.length ? { ids: nextIds.join(",") } : {}), priority: nextPriority } }, undefined, { shallow: true, scroll: false, locale: router.locale });
  }
  function remove(id: string) {
    const next = ids.filter((entry) => entry !== id);
    setIds(next);
    setItems((current) => current.filter((item) => item.listing_id !== id));
    removeComparisonSelection(id);
    setShareState("idle");
    updateUrl(next, priority);
  }
  async function retry(id: string) {
    if (retries.current.has(id)) return;
    const controller = new AbortController();
    retries.current.set(id, controller);
    setRetryIds((current) => [...current, id]);
    try {
      const next = await fetchComparisonItems([id], controller.signal);
      if (!controller.signal.aborted) setItems((current) => current.map((item) => item.listing_id === id ? next[0] : item));
    } catch {
      if (!controller.signal.aborted) setItems((current) => current.map((item) => item.listing_id === id ? failedComparisonItem(id) : item));
    } finally {
      retries.current.delete(id);
      if (!controller.signal.aborted) setRetryIds((current) => current.filter((entry) => entry !== id));
    }
  }
  function questions(item: ComparisonItem) {
    return item.passport?.questions.map((question) => question.reason === "photo_missing" ? p("photoQuestion", { check: p(`checks.${question.check_id}.title`) }) : p(`questions.${question.check_id}`)) ?? [];
  }
  async function copyQuestions(item: ComparisonItem) {
    try { await navigator.clipboard.writeText(questions(item).join("\n\n")); setCopyState({ id: item.listing_id, failed: false }); }
    catch { setCopyState({ id: item.listing_id, failed: true }); }
  }
  async function share() {
    const prefix = locale === "en" ? "" : `/${locale}`;
    const url = new URL(`${prefix}/browse/compare`, window.location.origin);
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("priority", priority);
    try { await navigator.clipboard.writeText(url.href); setShareState("copied"); }
    catch { setShareState("error"); }
  }
  function formatPrice(amount: number, currency: string) {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  }

  return <div data-testid="comparison-page" className="min-h-screen bg-bg">
    <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 sm:px-6">
      <Link href="/browse" className="text-sm text-muted hover:text-text">← {t("back")}</Link>
      <h1 className="mt-5 text-2xl font-bold text-text sm:text-3xl">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{t("description")}</p>
      {invalid || ids.length < 2 ? <section data-testid="comparison-empty" className="mt-6 rounded border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text">{t(invalid ? "invalidTitle" : "emptyTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t(invalid ? "invalidHint" : "emptyHint")}</p>
        {ids.length === 1 ? <p className="mt-3 text-sm text-text">{names(ids[0])}<button type="button" data-testid={`comparison-item-remove-${ids[0]}`} onClick={() => remove(ids[0])} className="ml-3 text-sm text-muted underline">{t("remove")}</button></p> : null}
        <Link href="/browse" className={`${buttonClass} mt-4 inline-block`}>{t("browse")}</Link>
      </section> : <>
        <fieldset className="mt-6"><legend className="text-base font-semibold text-text">{t("priorityTitle")}</legend><div className="mt-3 flex flex-wrap gap-2">{priorities.map((value) => <button type="button" key={value} data-testid={`comparison-priority-${value}`} aria-pressed={priority === value} onClick={() => { setPriority(value); setShareState("idle"); updateUrl(ids, value); }} className={`${buttonClass} ${priority === value ? "border-primary bg-primary/10 text-primary" : ""}`}>{t(`priorities.${value}`)}</button>)}</div></fieldset>
        <section data-testid="comparison-result" data-status={busy ? "loading" : result.status} aria-live="polite" className="mt-5 rounded border border-border bg-surface p-4 sm:p-5">
          {busy ? <p className="text-sm text-muted">{t("loading")}</p> : <>
            <h2 className="text-base font-semibold text-text">{t(result.status === "ranked" || result.status === "tie" ? `outcomes.${priority}` : `states.${result.status}`)}</h2>
            {result.winnerIds.length ? <ul className="mt-2 space-y-1">{result.winnerIds.map((id) => <li key={id} data-testid={`comparison-winner-${id}`} className="break-words text-base font-semibold text-primary">{names(id)}</li>)}</ul> : null}
            {result.status === "tie" ? <p className="mt-2 text-sm text-muted">{t("tieHint")}</p> : null}
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(`priorityHints.${priority}`)}</p>
            {result.blockedIds.length ? <p className="mt-2 text-sm leading-relaxed text-muted">{t("incompleteItems", { titles: result.blockedIds.map(names).join(", ") })}</p> : null}
            {priority === "budget" && missingPassports ? <p className="mt-2 text-sm text-warning">{t("budgetMissingPassport")}</p> : null}
          </>}
          <p className="mt-3 text-xs leading-relaxed text-muted">{p("disclaimer")}</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p id="comparison-scroll-hint" className="text-xs text-muted">{t("scrollHint")}</p><button type="button" data-testid="comparison-share" onClick={() => void share()} className={buttonClass}>{t("share")}</button></div>
        {shareState !== "idle" ? <p role={shareState === "error" ? "alert" : "status"} className="mt-2 text-sm text-muted">{t(shareState === "copied" ? "shareCopied" : "shareError")}</p> : null}
        {loading ? <p role="status" className="mt-6 text-sm text-muted">{t("loading")}</p> : <div role="region" aria-label={t("tableLabel")} aria-describedby="comparison-scroll-hint" tabIndex={0} className="mt-3 max-w-full overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-primary" data-testid="comparison-table-region">
          <table className="w-full table-fixed border-collapse text-left text-sm" style={{ minWidth: `${160 + items.length * 250}px` }}>
            <caption className="sr-only">{t("tableLabel")}</caption>
            <colgroup><col style={{ width: "160px" }} />{items.map((item) => <col key={item.listing_id} />)}</colgroup>
            <thead className="bg-surface"><tr><th scope="col" className="p-4 align-top font-semibold text-text">{t("criteria")}</th>{items.map((item) => <th key={item.listing_id} scope="col" data-testid={`comparison-item-${item.listing_id}`} className="border-l border-border p-4 align-top font-normal">
              {item.listing ? <Link href={`/browse/${item.listing_id}`} className="block break-words text-base font-semibold text-text hover:text-primary">{item.listing.title}</Link> : <span className="text-base font-semibold text-text">{t("itemFallback")}</span>}
              {item.passport ? <p data-testid={`comparison-model-${item.listing_id}`} className="mt-1 break-words text-sm font-medium text-text">{item.passport.model}</p> : null}
              <button type="button" data-testid={`comparison-item-remove-${item.listing_id}`} onClick={() => remove(item.listing_id)} className="mt-2 text-xs text-muted underline underline-offset-4">{t("remove")}</button>
              {item.availability !== "available" ? <p className="mt-3 text-sm text-warning">{t(`availability.${item.availability}`)}</p> : item.passport_error ? <p className="mt-3 text-sm text-warning">{t("passportError")}</p> : !item.passport ? <p className="mt-3 text-sm text-muted">{t("noPassport")}</p> : <p className="mt-3 text-xs leading-relaxed text-muted">{p("sellerProvided", { date: dates.format(new Date(item.passport.updated_at)) })}</p>}
              {item.availability !== "available" || item.passport_error ? <button type="button" data-testid={`comparison-retry-${item.listing_id}`} disabled={retryIds.includes(item.listing_id)} onClick={() => void retry(item.listing_id)} className={`${buttonClass} mt-3`}>{t(retryIds.includes(item.listing_id) ? "retrying" : "retry")}</button> : null}
              <SmartphoneMissionButton item={item} />
            </th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{t("price")}</th>{items.map((item, index) => <td key={item.listing_id} data-testid={`comparison-price-${item.listing_id}`} className="border-l border-border p-4 align-top font-semibold text-primary">{result.facts[index]?.price_amount !== null && result.facts[index]?.currency ? formatPrice(result.facts[index].price_amount!, result.facts[index].currency!) : t("unknown")}</td>)}</tr>
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{t("listingCondition")}</th>{items.map((item) => <td key={item.listing_id} className="border-l border-border p-4 align-top text-muted">{item.listing && ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"].includes(item.listing.condition) ? b(`conditions.${item.listing.condition}`) : t("unknown")}</td>)}</tr>
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{t("batteryHealth")}</th>{items.map((item, index) => <td key={item.listing_id} data-testid={`comparison-battery-${item.listing_id}`} className="border-l border-border p-4 align-top text-text">{result.facts[index]?.battery_health_percent == null ? t("unknown") : `${result.facts[index].battery_health_percent} %`}</td>)}</tr>
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{t("issues")}</th>{items.map((item, index) => <td key={item.listing_id} data-testid={`comparison-issues-${item.listing_id}`} className="border-l border-border p-4 align-top text-muted">{result.facts[index]?.issue_count == null ? t("incompleteChecks") : t("issueCount", { count: result.facts[index].issue_count! })}<p className="mt-1 text-xs">{result.facts[index]?.known_check_count == null ? t("unknown") : t("knownChecks", { count: result.facts[index].known_check_count! })}</p></td>)}</tr>
              {SMARTPHONE_CHECK_IDS.map((id) => <tr key={id}><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{p(`checks.${id}.title`)}</th>{items.map((item) => {
                const check = item.passport?.checks.find((entry) => entry.id === id);
                return <td key={item.listing_id} data-testid={`comparison-check-${item.listing_id}-${id}`} className="border-l border-border p-4 align-top">
                  {check ? <><span className={`inline-block rounded border px-2 py-0.5 text-xs ${check.status === "documented" ? "border-secondary/40 text-secondary" : "border-border text-muted"}`}>{p(`statuses.${check.status}`)}</span><p className={`mt-2 text-sm ${check.answer === "issue" ? "text-warning" : "text-muted"}`}>{p(`answers.${check.answer}`)}</p>{check.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{check.notes}</p> : null}
                    {check.photos.length ? <div className="mt-3 grid grid-cols-2 gap-2">{check.photos.map((photo, photoIndex) => <figure key={photo.photo_id}><PassportPhoto photo={photo} label={p("photoLabel", { check: p(`checks.${id}.title`), index: photoIndex + 1 })} /><figcaption className="mt-1 text-xs leading-relaxed text-muted">{p("photoSource", { date: dates.format(new Date(photo.created_at)) })}</figcaption></figure>)}</div> : null}</> : <span className="text-muted">{t("unknown")}</span>}
                </td>;
              })}</tr>)}
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{t("evidence")}</th>{items.map((item, index) => <td key={item.listing_id} className="border-l border-border p-4 align-top text-muted">{item.passport ? <><p>{t("documentedCount", { count: result.facts[index]?.documented_count ?? 0 })}</p><p className="mt-1">{t("declaredCount", { count: result.facts[index]?.declared_count ?? 0 })}</p></> : t("unknown")}</td>)}</tr>
              <tr><th scope="row" className="bg-surface p-4 align-top font-semibold text-text">{p("questionsTitle")}</th>{items.map((item) => <td key={item.listing_id} className="border-l border-border p-4 align-top text-muted">{questions(item).length ? <><ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed">{questions(item).map((question) => <li key={question}>{question}</li>)}</ul><button type="button" data-testid={`comparison-copy-questions-${item.listing_id}`} onClick={() => void copyQuestions(item)} className={`${buttonClass} mt-3`}>{p("copyQuestions")}</button>{copyState?.id === item.listing_id ? <p role={copyState.failed ? "alert" : "status"} className="mt-2 text-sm">{p(copyState.failed ? "copyError" : "copied")}</p> : null}</> : item.passport ? p("noQuestions") : t("noPassportQuestions")}</td>)}</tr>
            </tbody>
          </table>
        </div>}
      </>}
    </main>
  </div>;
}
