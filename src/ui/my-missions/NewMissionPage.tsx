import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";
import { BuyMissionForm, MissionSummary, prefillFromListing, type BuyMissionInput } from "../webmcp/BuyMissionPanel";
import { clearBuyMissionDraft, missionDraftSource } from "../webmcp/buyMissionDraft";
import type { StableToolResult } from "../../webmcp/types";
import { buyMissionZodSchema } from "../../webmcp/tools/mission-tools";
import { randomUuid } from "../../webmcp/utils";
import { missionPayload, missionRequest, missionView, MissionRequestError, type OwnerMission } from "./missionClient";

type PendingRequest = { fingerprint: string; key: string; input: BuyMissionInput; ownerId: string };
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const REQUEST_KEY = "clawdeals:buy-mission-request:v1";
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const failure = (code: string): StableToolResult => ({ ok: false, error: { code, message: code, details: {} }, meta: { request_id: randomUuid() } });

export default function NewMissionPage() {
  const t = useTranslations("myMissions");
  const router = useRouter();
  const gate = useOwnerSessionGate();
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [pending, setPending] = useState<BuyMissionInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const submittingOwnerId = useRef<string | null>(null);
  const resolveSubmission = useRef<((value: StableToolResult) => void) | null>(null);
  const request = useRef<PendingRequest | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const prefix = router.locale && router.locale !== "en" ? `/${router.locale}` : "";
  const source = missionDraftSource(router.query);
  const prefill = useMemo(() => {
    if (single(router.query.listing)) {
      const number = (value: string | string[] | undefined) => value === undefined ? null : Number(single(value));
      return prefillFromListing({
        title: single(router.query.title), category: single(router.query.category),
        price: number(router.query.price), marketCode: single(router.query.market),
        latitude: number(router.query.lat), longitude: number(router.query.lng)
      });
    }
    const rawPrice = Number(single(router.query.price_max));
    const price = Number.isFinite(rawPrice) && rawPrice > 0 ? String(Math.round(rawPrice * 100) / 100) : "";
    return { query: (single(router.query.query) || "").slice(0, 80), preferredPriceMax: price, hardBudgetMax: price, requirements: "" };
  }, [router.query]);

  useEffect(() => { if (pending) reviewHeading.current?.focus(); }, [pending]);
  useEffect(() => () => { resolveSubmission.current?.(failure("USER_DENIED")); }, []);

  const submit = useCallback(async (args: BuyMissionInput, { draftSaved }: { draftSaved: boolean }) => {
    const session = await probeOwnerSession({ fresh: true });
    if (session.state !== "authenticated") {
      if (session.state === "unknown") return failure("OWNER_CREATE_FAILED");
      if (!draftSaved) return failure("DRAFT_STORAGE_UNAVAILABLE");
      const next = router.asPath.startsWith(`${prefix}/my/`) ? router.asPath : `${prefix}${router.asPath}`;
      void router.push(`${prefix}/auth/login?next=${encodeURIComponent(next)}`, undefined, { locale: false });
      return failure("OWNER_AUTH_REQUIRED");
    }
    submittingOwnerId.current = session.ownerId;
    let unconfirmed: PendingRequest | null = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(REQUEST_KEY) || "null");
      const input = buyMissionZodSchema.safeParse(saved?.input);
      if (saved?.ownerId === session.ownerId && typeof saved.key === "string" && input.success &&
        saved.fingerprint === JSON.stringify(missionPayload(input.data))) unconfirmed = saved;
    } catch { /* Fall back to the same-tab in-memory attempt. */ }
    unconfirmed ||= request.current?.ownerId === session.ownerId ? request.current : null;
    request.current = unconfirmed;
    setUncertain(Boolean(unconfirmed));
    setCreateError(unconfirmed ? "uncertainResult" : null);
    setPending(unconfirmed?.input || args);
    return new Promise<StableToolResult>((resolve) => { resolveSubmission.current = resolve; });
  }, [router, prefix]);

  const cancel = () => {
    if (uncertain) return;
    resolveSubmission.current?.(failure("USER_DENIED"));
    resolveSubmission.current = null;
    setPending(null);
    setCreateError(null);
  };

  const confirm = async () => {
    if (!pending || saving) return;
    setSaving(true);
    setCreateError(null);
    // The session cookie can change in another tab while this review is open.
    // Never submit the previous owner's private brief under the new account.
    const session = await probeOwnerSession({ fresh: true });
    if (session.state !== "authenticated" || session.ownerId !== submittingOwnerId.current) {
      setCreateError(session.state === "unknown" ? "sessionCheckFailed" : session.state === "anonymous" ? "sessionExpired" : "sessionChanged");
      setSaving(false);
      return;
    }
    const body = missionPayload(pending);
    const fingerprint = JSON.stringify(body);
    // A retry, including after reload, keeps its original body and key until
    // the server confirms the outcome. Editing is disabled while it is unknown.
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, key: randomUuid(), input: pending, ownerId: submittingOwnerId.current || "" };
    }
    try {
      const saved = JSON.stringify(request.current);
      sessionStorage.setItem(REQUEST_KEY, saved);
      // A successful write alone is insufficient when browser storage silently
      // drops it. Never send a request that cannot be recovered after reload.
      if (sessionStorage.getItem(REQUEST_KEY) !== saved) throw new Error("Request storage unavailable");
    } catch {
      if (!uncertain) request.current = null;
      setCreateError("requestStorageUnavailable");
      setSaving(false);
      return;
    }
    try {
      const created = await missionRequest<OwnerMission>("", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.current.key }, body: fingerprint
      });
      if (!created.watchlist_id) throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
      clearBuyMissionDraft();
      try { sessionStorage.removeItem(REQUEST_KEY); } catch { /* Storage unavailable. */ }
      resolveSubmission.current?.({ ok: true, data: { mission: missionView(created) }, meta: { request_id: randomUuid() } });
      resolveSubmission.current = null;
      void router.push(`${prefix}/my/missions/${encodeURIComponent(created.watchlist_id)}`, undefined, { locale: false });
    } catch (cause) {
      // This business rejection happens before insertion, including when a
      // retry recovers its lost response. Other 409s can still be in progress.
      const quotaRejected = cause instanceof MissionRequestError && cause.status === 409 && cause.code === "WATCHLIST_LIMIT_REACHED";
      const definitiveRejection = cause instanceof MissionRequestError && [400, 401, 403, 404, 422, 429].includes(cause.status);
      const unknownOutcome = !quotaRejected && (uncertain || !definitiveRejection);
      setUncertain(unknownOutcome);
      setCreateError(quotaRejected ? "missionLimitReached" : cause instanceof MissionRequestError && cause.status === 401 ? "sessionExpired" : unknownOutcome ? "uncertainResult" : "createError");
      if (!unknownOutcome) {
        request.current = null;
        try { sessionStorage.removeItem(REQUEST_KEY); } catch { /* Storage unavailable. */ }
      }
      setSaving(false);
    }
  };

  const preview = pending ? {
    watchlist_id: "preview", name: pending.query, active: true, market_code: pending.market_code,
    currency: pending.market_code === "GB" ? "GBP" : "EUR", created_at: "", criteria: missionPayload(pending).criteria
  } as OwnerMission : null;

  return (
    <div className="min-h-screen bg-bg" data-testid="new-mission-page">
      <PageHeader title={t("newTitle")}><AppNav current="missions" /></PageHeader>
      <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto py-6 space-y-5">
        <div className="px-4 sm:px-6 space-y-2">
          <Link href="/my/missions" className="text-sm text-primary underline">{t("allMissions")}</Link>
          <p className="text-sm text-muted max-w-2xl">{t("intro")}</p>
          <p className="text-xs text-subtle">{t("draftHint")}</p>
        </div>
        {pending && preview ? (
          <section aria-labelledby="mission-review-title" className="mx-4 sm:mx-6 border border-primary/50 bg-surface p-4 space-y-4">
            <h2 ref={reviewHeading} tabIndex={-1} id="mission-review-title" className="font-semibold text-xl text-text">{t("review")}</h2>
            <MissionSummary mission={missionView(preview)} statusLabel={t("notCreated")} />
            <p className="text-sm text-muted">{t("reviewHint")}</p>
            <p className="text-sm text-muted">{t("inAppHint")}</p>
            {createError ? <p role="alert" className="text-sm text-warning">{t(createError)}</p> : null}
            {createError === "sessionExpired" ? <a className="text-sm text-primary underline" href={`${prefix}/auth/login?next=${encodeURIComponent(router.asPath.startsWith(`${prefix}/my/`) ? router.asPath : `${prefix}${router.asPath}`)}`}>{t("signIn")}</a> : null}
            {createError === "sessionChanged" ? <Link href="/settings/account" className="text-sm text-primary underline">{t("checkAccount")}</Link> : null}
            {uncertain || createError === "missionLimitReached" ? <Link href="/my/missions" className="inline-block text-primary underline">{t("checkMissions")}</Link> : null}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={saving} onClick={() => void confirm()} className="px-5 py-3 bg-primary text-bg font-semibold disabled:opacity-50">{saving ? t("saving") : t("confirm")}</button>
              <button type="button" disabled={saving || uncertain} onClick={cancel} className="px-5 py-3 border border-border text-text disabled:opacity-50">{t("edit")}</button>
            </div>
          </section>
        ) : null}
        <div hidden={Boolean(pending)}>
          {hydrated && router.isReady ? <BuyMissionForm key={source} prefill={prefill} draftSource={source} executeMission={submit}
            submitLabel={gate === "authenticated" ? t("review") : t("continue")} submitHint={t("submitHint")} /> : <p className="px-4 text-muted">{t("loading")}</p>}
        </div>
      </main>
    </div>
  );
}
