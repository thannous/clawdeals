import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSmartphoneListing } from "../../lib/smartphone-passport";
import { passportFromResponse, type Passport } from "./passport-types";
import PassportPhoto from "./PassportPhoto";

export default function SmartphonePassport({ listingId, title, category }: { listingId: string; title?: string; category?: string }) {
  const t = useTranslations("passport");
  const locale = useLocale();
  const [passport, setPassport] = useState<Passport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const request = useRef<AbortController | null>(null);
  const smartphoneHint = isSmartphoneListing(category, title);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    setCopyState("idle");
    try {
      const response = await fetch(`/api/v1/public/listings/${encodeURIComponent(listingId)}/passport`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Load failed");
      const next = passportFromResponse(await response.json(), { listingId, access: "public" });
      if (!controller.signal.aborted) {
        setPassport(next);
        setState("ready");
      }
    } catch {
      if (!controller.signal.aborted) setState("error");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const questions = passport?.questions.map((question) => question.reason === "photo_missing"
    ? t("photoQuestion", { check: t(`checks.${question.check_id}.title`) })
    : t(`questions.${question.check_id}`)) ?? [];

  async function copyQuestions() {
    try {
      await navigator.clipboard.writeText(questions.join("\n\n"));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  if ((state === "ready" && !passport && !smartphoneHint) || (state === "loading" && !smartphoneHint)) return null;

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const documentedCount = passport?.checks.filter((check) => check.status === "documented").length ?? 0;

  return (
    <section aria-labelledby="passport-title" className="rounded border border-border bg-surface p-4 sm:p-6" data-testid="smartphone-passport">
      <h2 id="passport-title" className="text-lg font-semibold text-text">{t("title")}</h2>
      {state === "loading" ? <p role="status" className="mt-3 text-sm text-muted">{t("loading")}</p> : null}
      {state === "error" ? <div className="mt-3"><p role="alert" className="text-sm text-error">{t("publicLoadError")}</p><button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-primary underline underline-offset-4">{t("retry")}</button></div> : null}
      {state === "ready" && !passport ? <p className="mt-3 text-sm leading-relaxed text-muted" data-testid="passport-empty">{t("empty")}</p> : null}
      {state === "ready" && passport ? (
        <>
          <p className="mt-1 break-words text-base font-medium text-text" data-testid="passport-public-model">{passport.model}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("sellerProvided", { date: dateFormatter.format(new Date(passport.updated_at)) })}</p>
          <p className="mt-3 text-sm text-text">{t("documentedCount", { count: documentedCount })}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("disclaimer")}</p>
          <ul className="mt-5 divide-y divide-border">
            {passport.checks.map((check) => (
              <li key={check.id} className="py-4 first:pt-0" data-testid={`passport-public-check-${check.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text">{t(`checks.${check.id}.title`)}</h3>
                  <span data-testid={`passport-check-status-${check.id}`} className={`rounded border px-2 py-0.5 text-xs ${check.status === "documented" ? "border-secondary/40 text-secondary" : "border-border text-muted"}`}>{t(`statuses.${check.status}`)}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{t(`answers.${check.answer}`)}</p>
                {check.id === "battery" && passport.battery_health_percent !== null ? <p className="mt-2 text-sm font-medium text-text" data-testid="passport-public-battery">{t("batteryValue", { value: passport.battery_health_percent })}</p> : null}
                {check.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{check.notes}</p> : null}
                {check.photos.length ? <div className="mt-3 grid max-w-md grid-cols-2 gap-3">{check.photos.map((photo, index) => <figure key={photo.photo_id}><PassportPhoto photo={photo} label={t("photoLabel", { check: t(`checks.${check.id}.title`), index: index + 1 })} /><figcaption className="mt-1 text-xs leading-relaxed text-muted">{t("photoSource", { date: dateFormatter.format(new Date(photo.created_at)) })}</figcaption></figure>)}</div> : null}
              </li>
            ))}
          </ul>
          {questions.length ? <div className="border-t border-border pt-4" data-testid="passport-questions">
            <h3 className="text-base font-semibold text-text">{t("questionsTitle")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t("questionsHint")}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">{questions.map((question, index) => <li key={`${passport.questions[index].check_id}-${passport.questions[index].reason}`}>{question}</li>)}</ul>
            <button type="button" data-testid="passport-copy-questions" onClick={() => void copyQuestions()} className="mt-4 rounded border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("copyQuestions")}</button>
            {copyState === "copied" ? <p role="status" className="mt-2 text-sm text-success">{t("copied")}</p> : null}
            {copyState === "error" ? <p role="alert" className="mt-2 text-sm text-error">{t("copyError")}</p> : null}
          </div> : <p className="border-t border-border pt-4 text-sm leading-relaxed text-muted">{t("noQuestions")}</p>}
        </>
      ) : null}
    </section>
  );
}
