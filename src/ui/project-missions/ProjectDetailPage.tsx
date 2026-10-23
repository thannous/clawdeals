import Link from "next/link";
import { useRouter } from "next/router";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { projectCandidatePriceCents, type ProjectCandidate, type ProjectConfiguration, type ProjectFacts } from "../../shared/project-missions";
import { randomUuid } from "../../webmcp/utils";
import ProjectFactsForm from "./ProjectFactsForm";
import ProjectConversations from "./ProjectConversations";
import ProjectShell, { buttonClass, ProjectFailure, secondaryClass } from "./ProjectShell";
import { assertProjectOwner, mutationHeaders, projectRequest, ProjectRequestError, useProjectResource, type ProjectMission } from "./projectClient";

type Review = { kind: "basket" | "contact"; mission: ProjectMission; configuration: ProjectConfiguration };

export default function ProjectDetailPage() {
  const t = useTranslations("projectMissions");
  const locale = useLocale();
  const router = useRouter();
  const id = typeof router.query.project_id === "string" ? router.query.project_id : null;
  const { data: mission, error, loading, reload, update } = useProjectResource<ProjectMission>(id ? `/${encodeURIComponent(id)}` : null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const mutate = async (action: string, body: Record<string, unknown>, snapshot = mission): Promise<boolean> => {
    if (!snapshot || busy) return false;
    setBusy(true); setMutationError(null); setNotice(null);
    try {
      await assertProjectOwner(snapshot.owner_id);
      const payload = JSON.stringify({ expected_version: snapshot.version, ...body });
      const storage = `clawdeals:project-action:v1:${snapshot.owner_id}:${snapshot.id}`;
      const previous = JSON.parse(sessionStorage.getItem(storage) || "null");
      const key = previous?.action === action && previous?.payload === payload ? previous.key : randomUuid();
      const attempt = JSON.stringify({ action, payload, key });
      sessionStorage.setItem(storage, attempt);
      if (sessionStorage.getItem(storage) !== attempt) throw new Error("Storage unavailable");
      const next = await projectRequest<ProjectMission>(`/${snapshot.id}/${action}`, { method: "POST", headers: mutationHeaders(snapshot.owner_id, key), body: payload });
      if (next.id !== snapshot.id || next.owner_id !== snapshot.owner_id || !next.plan || !Number.isInteger(next.version)) throw new ProjectRequestError(502, "SERVER_CONTRACT_ERROR");
      sessionStorage.removeItem(storage); update(next); setReview(null);
      setNotice(action === "contact" ? "questionsSent" : action === "confirm" ? "basketConfirmed" : action === "select" ? "configurationSelected" : "recalculated");
      return true;
    } catch (cause) {
      if (cause instanceof ProjectRequestError && cause.mission) { update(cause.mission); setReview(null); }
      setMutationError(cause instanceof ProjectRequestError ? cause.code : "NETWORK_ERROR"); return false;
    } finally { setBusy(false); }
  };
  const itemView = (item: ProjectCandidate, version: number) => <div className="space-y-3">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">{t(`slots.${item.slot}`)}</p><Link className="block text-sm font-semibold text-text underline underline-offset-4 [overflow-wrap:anywhere]" href={`/browse/${item.listing_id}`}>{item.title}</Link></div><span className="shrink-0 text-sm font-semibold text-text">{money(projectCandidatePriceCents(item))}</span></div>
    {item.facts?.quoted_price_cents != null ? <p className="text-xs text-muted">{t("quotedPriceUsed", { amount: money(item.price_cents) })}</p> : null}
    <p className="text-xs text-muted">{item.facts?.delivery_fee_cents == null ? t("feeUnknown") : t("itemFee", { amount: money(item.facts.delivery_fee_cents) })}{item.distance_km == null ? "" : ` · ${t("distance", { distance: Math.round(item.distance_km) })}`}</p>
    {item.facts ? <p className="text-xs text-muted">{t("userConfirmed", { date: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.facts.confirmed_at)) })}</p> : <p className="text-xs text-warning">{t("notVerified")}</p>}
    <ProjectFactsForm key={`${item.listing_id}:${version}`} item={item} usbC={mission?.brief.laptop_connector === "USB_C"} busy={busy || Boolean(review)} save={(facts: ProjectFacts) => mutate("facts", { listing_id: item.listing_id, facts })} />
  </div>;
  if (loading) return <ProjectShell title={t("detailTitle")}><p role="status" className="text-muted">{t("loading")}</p></ProjectShell>;
  if (error || !mission) return <ProjectShell title={t("detailTitle")}><ProjectFailure code={error || undefined} retry={reload} /></ProjectShell>;
  const selected = mission.plan.configurations.find(configuration => configuration.id === mission.selected_configuration_id);
  const approved = mission.confirmed_version === mission.version;
  return <ProjectShell title={t("detailTitle")}>
    <section className="space-y-4 border-b border-border pb-5"><div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 max-w-3xl space-y-2"><h2 className="text-2xl font-semibold text-text [overflow-wrap:anywhere]">{mission.brief.description}</h2><p className="text-sm text-muted">{t("listSummary", { budget: money(mission.brief.budget_cents), area: mission.brief.location.label || t("selectedArea"), radius: mission.brief.location.radius_km })}</p></div><button disabled={busy || Boolean(review)} className={secondaryClass} onClick={() => void mutate("recalculate", {})}>{busy ? t("updating") : t("recalculate")}</button></div><p className="text-sm text-muted">{t("boundary")}</p><p className="text-xs text-muted">{t("freshness", { date: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(mission.updated_at)), version: mission.version })}</p></section>
    {mission.plan.pickup_expired ? <div role="alert" className="space-y-3 border border-warning p-4 text-warning"><p>{t("deadlineExpired")}</p><Link href="/my/projects/new" className="inline-block min-h-11 py-2 underline">{t("adjustProject")}</Link></div> : null}
    {mutationError ? <ProjectFailure code={mutationError} /> : null}
    {notice ? <p role="status" className="border border-primary p-4 text-sm text-primary">{t(notice)}</p> : null}
    {review ? <section className="space-y-5 border-2 border-primary bg-surface p-5" aria-labelledby="project-action-review" data-testid="project-action-review">
      <h2 ref={reviewHeading} tabIndex={-1} id="project-action-review" className="text-xl font-semibold text-text">{t(review.kind === "basket" ? "reviewBasket" : "reviewMessages")}</h2>
      <p className="text-sm text-muted">{t("reviewVersion", { version: review.mission.version, configuration: t(`variants.${review.configuration.variant}`) })}</p>
      {review.kind === "basket" ? <><ul className="space-y-2 text-sm text-text">{review.configuration.items.map(item => <li key={item.listing_id} className="flex justify-between gap-4"><span>{item.title}</span><span className="shrink-0">{money(projectCandidatePriceCents(item) + (item.facts?.delivery_fee_cents || 0))}</span></li>)}</ul><p className="text-lg font-semibold text-primary">{t("total", { amount: money(review.configuration.total_known_cents) })}</p><p className="text-sm text-muted">{t("approvalHint")}</p></> : <><p className="text-sm text-muted">{t("contactHint")}</p><div className="space-y-4">{review.configuration.seller_groups.map((group, index) => <article key={group.seller_agent_id} className="border border-border bg-bg p-4"><h3 className="mb-2 font-semibold text-text">{t("seller", { number: index + 1 })}</h3><p className="mb-3 text-xs text-muted">{review.configuration.items.filter(item => group.listing_ids.includes(item.listing_id)).map(item => item.title).join(", ")}</p><p className="whitespace-pre-wrap text-sm text-text [overflow-wrap:anywhere]">{group.draft_message}</p></article>)}</div></>}
      <div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonClass} onClick={() => void mutate(review.kind === "basket" ? "confirm" : "contact", { configuration_id: review.configuration.id, ...(review.kind === "contact" ? { confirmed_preview: true } : {}) }, review.mission)}>{busy ? t("saving") : t(review.kind === "basket" ? "confirmBasket" : "sendQuestions")}</button><button disabled={busy} className={secondaryClass} onClick={() => setReview(null)}>{t("cancel")}</button></div>
    </section> : null}
    {mission.plan.search_limited ? <p className="text-sm text-warning">{t("searchLimited")}</p> : null}
    {!mission.plan.configurations.length ? <section className="space-y-3 border border-border bg-surface p-6"><h3 className="text-lg font-semibold text-text">{t("noConfigurations")}</h3><p className="text-sm text-muted">{t("noConfigurationsHint")}</p>{mission.plan.missing_slots.length ? <p className="text-sm text-warning">{t("missingSlots", { slots: mission.plan.missing_slots.map(slot => t(`slots.${slot}`)).join(", ") })}</p> : null}<Link href="/my/projects/new" className="inline-block py-2 text-primary underline">{t("adjustProject")}</Link></section> : <>
      <div className="space-y-2"><h3 className="text-xl font-semibold text-text">{t("configurations")}</h3><p className="text-sm text-muted">{t("configurationsHint")}</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-3">{mission.plan.configurations.map(configuration => <article key={configuration.id} data-testid={`project-configuration-${configuration.variant}`} className={`min-w-0 space-y-4 border bg-surface p-4 sm:p-5 ${configuration.id === selected?.id ? "border-primary" : "border-border"}`}>
        <div className="space-y-2"><h4 className="text-lg font-semibold text-text">{t(`variants.${configuration.variant}`)}</h4><p className="text-sm text-muted">{t(`variantHints.${configuration.variant}`)}</p><p className="text-2xl font-semibold text-primary">{money(configuration.total_known_cents)}</p><p className="text-xs text-muted">{configuration.unknown_fee_count ? t("unknownFees", { count: configuration.unknown_fee_count }) : t("feesIncluded")}</p><p className="text-sm text-muted">{t(configuration.unknown_fee_count ? "remainingEstimated" : "remaining", { amount: money(configuration.remaining_cents) })}</p></div>
        <ul className="divide-y divide-border">{configuration.items.map(item => <li key={item.listing_id} className="py-4">{itemView(item, mission.version)}</li>)}</ul>
        <div className="space-y-2 border-t border-border pt-4"><h5 className="text-sm font-semibold text-text">{t("checks")}</h5><ul className="space-y-2 text-sm">{configuration.checks.map((check, index) => <li key={`${check.listing_id}:${check.code}:${index}`} className={check.status === "unknown" ? "text-warning" : "text-muted"}>{t(`checksLabel.${check.code}`)} : {t(check.status === "unknown" ? "toVerify" : check.code === "delivery_method" ? "fromListing" : "confirmedByYou")}</li>)}</ul></div>
        <button className={configuration.id === selected?.id ? secondaryClass : buttonClass} disabled={busy || Boolean(review) || mission.plan.pickup_expired || configuration.id === selected?.id} onClick={() => void mutate("select", { configuration_id: configuration.id })}>{configuration.id === selected?.id ? t("selected") : t("select")}</button>
      </article>)}</div>
    </>}
    {selected ? <section className="space-y-4 border border-primary bg-surface p-5" data-testid="project-selected-basket"><h3 className="text-xl font-semibold text-text">{t("selectedBasket", { configuration: t(`variants.${selected.variant}`) })}</h3><p className="text-sm text-muted">{approved ? t("approvedCurrent") : selected.ready_to_approve ? t("readyHint") : t("blockedHint")}</p><div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={busy || Boolean(review) || !selected.ready_to_approve || approved} onClick={() => setReview({ kind: "basket", mission, configuration: selected })}>{approved ? t("approved") : t("reviewBasket")}</button><button className={secondaryClass} disabled={busy || Boolean(review) || mission.plan.pickup_expired} onClick={() => setReview({ kind: "contact", mission, configuration: selected })}>{t("reviewMessages")}</button></div></section> : null}
    {mission.plan.corrections?.length ? <section className="space-y-4 border-t border-warning pt-5" data-testid="project-corrections"><h3 className="text-xl font-semibold text-text">{t("correctionsTitle")}</h3><p className="max-w-3xl text-sm text-muted">{t("correctionsHint")}</p><div className="grid gap-4 sm:grid-cols-2">{mission.plan.corrections.map(item => <article key={item.listing_id} className="min-w-0 border border-warning/50 bg-surface p-4">{itemView(item, mission.version)}</article>)}</div></section> : null}
    {mission.contacts?.length ? <ProjectConversations key={`${mission.id}:${mission.contacts.length}`} missionId={mission.id} agentId={mission.agent_id} candidates={[...Object.values(mission.plan.alternatives).flat(), ...(mission.plan.corrections || [])]} /> : null}
    <section className="space-y-4 border-t border-border pt-5"><h3 className="text-xl font-semibold text-text">{t("alternatives")}</h3><p className="text-sm text-muted">{t("alternativesHint")}</p><div className="grid gap-4 sm:grid-cols-2">{Object.entries(mission.plan.alternatives).filter(([, items]) => items.length).map(([slot, items]) => <details key={slot} className="min-w-0 border border-border bg-surface p-4"><summary className="cursor-pointer font-semibold text-text">{t(`slots.${slot}`)} ({items.length})</summary><ul className="divide-y divide-border">{items.map(item => <li key={item.listing_id} className="py-4">{itemView(item, mission.version)}</li>)}</ul></details>)}</div><p className="text-xs text-muted">{t("changeHint")}</p></section>
  </ProjectShell>;
}
