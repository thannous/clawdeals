import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { BuyMissionForm, MissionSummary, prefillFromListing, type BuyMissionInput } from "../webmcp/BuyMissionPanel";
import { clearBuyMissionDraft, readBuyMissionDraft, saveBuyMissionDraft, missionDraftSource } from "../webmcp/buyMissionDraft";
import type { StableToolResult } from "../../webmcp/types";
import { randomUuid } from "../../webmcp/utils";
import { confirmedOwnerMission, missionPayload, missionRequest, missionView, MissionRequestError, type OwnerMission } from "./missionClient";
import { clearMissionRequest, readMissionRequest, writeMissionRequest, type PendingMissionRequest } from "./missionRequestRecovery";

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const failure = (code: string): StableToolResult => ({ ok: false, error: { code, message: code, details: {} }, meta: { request_id: randomUuid() } });

export default function NewMissionPage() {
  const t = useTranslations("myMissions");
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [pending, setPending] = useState<BuyMissionInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const submittingOwnerId = useRef<string | null>(null);
  const submittingDraftSource = useRef<string | null>(null);
  const resolveSubmission = useRef<((value: StableToolResult) => void) | null>(null);
  const request = useRef<PendingMissionRequest | null>(null);
  const [prepared, setPrepared] = useState<{ source: string; ownerId: string | null; recovery: PendingMissionRequest | null; error?: string } | null>(null);
  const preparation = useRef(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const prefix = router.locale && router.locale !== "en" ? `/${router.locale}` : "";
  const source = missionDraftSource(router.query);
  const prepare = useCallback(async () => {
    const generation = ++preparation.current;
    setPrepared(null);
    const snapshot = await probeOwnerSession({ fresh: true });
    if (generation !== preparation.current) return;
    if (snapshot.state === "unknown" || (snapshot.state === "authenticated" && !snapshot.ownerId)) {
      setPrepared({ source, ownerId: null, recovery: null, error: "sessionCheckFailed" });
      return;
    }
    try {
      const recovery = snapshot.ownerId ? readMissionRequest(snapshot.ownerId) : null;
      if (!recovery && source.startsWith("smartphone:") && !readBuyMissionDraft(source, snapshot.ownerId)) {
        setPrepared({ source, ownerId: snapshot.ownerId, recovery: null, error: "smartphoneDraftMissing" });
        return;
      }
      setPrepared({ source, ownerId: snapshot.ownerId, recovery });
    } catch {
      setPrepared({ source, ownerId: snapshot.ownerId, recovery: null, error: "requestStorageUnavailable" });
    }
  }, [source]);
  useEffect(() => {
    if (hydrated && router.isReady) void prepare();
    return () => { preparation.current += 1; };
  }, [hydrated, router.isReady, prepare]);
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
    if (!session.ownerId) return failure("OWNER_CREATE_FAILED");
    if (prepared?.ownerId && session.ownerId !== prepared.ownerId) {
      setCreateError("sessionChanged");
      return failure("OWNER_CREATE_FAILED");
    }
    if (!prepared?.ownerId) {
      const anonymousDraft = readBuyMissionDraft(source);
      if (!anonymousDraft || !saveBuyMissionDraft(source, anonymousDraft, session.ownerId)) return failure("DRAFT_STORAGE_UNAVAILABLE");
      setPrepared(previous => previous ? { ...previous, ownerId: session.ownerId } : previous);
    }
    submittingOwnerId.current = session.ownerId;
    let unconfirmed: PendingMissionRequest | null = null;
    try {
      unconfirmed = readMissionRequest(session.ownerId!);
    } catch { setCreateError("requestStorageUnavailable"); return failure("DRAFT_STORAGE_UNAVAILABLE"); }
    unconfirmed ||= request.current?.ownerId === session.ownerId ? request.current : null;
    request.current = unconfirmed;
    submittingDraftSource.current = unconfirmed ? unconfirmed.draftSource || null : source;
    setUncertain(Boolean(unconfirmed));
    setCreateError(unconfirmed ? "uncertainResult" : null);
    setPending(unconfirmed?.input || args);
    return new Promise<StableToolResult>((resolve) => { resolveSubmission.current = resolve; });
  }, [router, prefix, prepared, source]);

  const resume = () => {
    if (!prepared?.recovery) return;
    request.current = prepared.recovery;
    submittingDraftSource.current = prepared.recovery.draftSource || null;
    submittingOwnerId.current = prepared.ownerId;
    setUncertain(true);
    setCreateError("uncertainResult");
    setPending(prepared.recovery.input);
  };

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
    if (request.current?.fingerprint !== fingerprint || request.current?.ownerId !== session.ownerId) {
      request.current = { fingerprint, key: randomUuid(), input: pending, ownerId: submittingOwnerId.current || "",
        ...(submittingDraftSource.current ? { draftSource: submittingDraftSource.current } : {}) };
    }
    if (!writeMissionRequest(request.current)) {
      if (!uncertain) request.current = null;
      setCreateError("requestStorageUnavailable");
      setSaving(false);
      return;
    }
    try {
      const created = confirmedOwnerMission(await missionRequest<unknown>("", {
        method: "POST", headers: {
          "Content-Type": "application/json", "Idempotency-Key": request.current.key,
          "X-Expected-Owner-Id": request.current.ownerId
        }, body: fingerprint
      }), pending);
      const view = missionView(created);
      if (request.current.draftSource) clearBuyMissionDraft(request.current.draftSource, request.current.ownerId);
      clearMissionRequest(request.current);
      resolveSubmission.current?.({ ok: true, data: { mission: view }, meta: { request_id: randomUuid() } });
      resolveSubmission.current = null;
      void router.push(`${prefix}/my/missions/${encodeURIComponent(created.watchlist_id)}`, undefined, { locale: false });
    } catch (cause) {
      // This business rejection happens before insertion, including when a
      // retry recovers its lost response. Other 409s can still be in progress.
      const quotaRejected = cause instanceof MissionRequestError && cause.status === 409 && cause.code === "WATCHLIST_LIMIT_REACHED";
      const definitiveRejection = cause instanceof MissionRequestError && [400, 401, 403, 404, 422, 429].includes(cause.status);
      const unknownOutcome = !quotaRejected && (uncertain || !definitiveRejection);
      setUncertain(unknownOutcome);
      const ownerChanged = cause instanceof MissionRequestError && cause.code === "OWNER_SESSION_CHANGED";
      setCreateError(ownerChanged ? "sessionChanged" : quotaRejected ? "missionLimitReached" : cause instanceof MissionRequestError && cause.status === 401 ? "sessionExpired" : unknownOutcome ? "uncertainResult" : "createError");
      if (!unknownOutcome) {
        if (clearMissionRequest(request.current!)) {
          request.current = null;
          setPrepared(previous => previous ? { ...previous, recovery: null } : previous);
        } else {
          setUncertain(true);
          setCreateError("requestStorageUnavailable");
        }
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
          {prepared?.source === source && !pending ? prepared.error ? (
            <div className="px-4 space-y-3"><p role="alert" className="text-warning">{t(prepared.error)}</p><button onClick={() => void prepare()} className="underline">{t("retry")}</button>{prepared.error === "smartphoneDraftMissing" ? <Link href="/my/missions/new" className="ml-4 text-primary underline">{t("newTitle")}</Link> : null}</div>
          ) : prepared.recovery ? (
            <div className="px-4 space-y-3"><p className="text-warning">{t("uncertainResult")}</p><button onClick={resume} className="px-5 py-3 bg-primary text-bg font-semibold">{t("review")}</button></div>
          ) : <>
            {createError ? <div className="px-4 space-y-2"><p role="alert" className="text-warning">{t(createError)}</p>{createError === "sessionChanged" ? <button onClick={() => void prepare()} className="text-primary underline">{t("retry")}</button> : null}</div> : null}
            <BuyMissionForm key={`${source}:${prepared.ownerId || "anonymous"}`} prefill={prefill} draftSource={source} draftOwnerId={prepared.ownerId} executeMission={submit}
              submitLabel={prepared.ownerId ? t("review") : t("continue")} submitHint={t("submitHint")} />
          </> : !pending ? <p className="px-4 text-muted">{t("loading")}</p> : null}
        </div>
      </main>
    </div>
  );
}
