import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, Clock3, MapPin, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { evaluatePolicyAction, POLICY_DECISION } from "../../server/policy/evaluate";
import { describePolicyDecision } from "../../webmcp/activity/policy-label";
import Toast from "../console/shared/Toast";
import { useToast } from "../console/shared/useToast";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import SettingsNav from "./SettingsNav";

type PolicyData = {
  version: number;
  budgets: {
    max_offer: number | null;
    preferred_offer: number | null;
    currency: string | null;
  };
  approval_thresholds: {
    offer_amount_gt: number | null;
    contact_reveal: string;
  };
  auto_approve: {
    message_types: string[];
    actions: string[];
  };
  mission_defaults: {
    radius_km: number;
    autonomous_actions: string[];
  };
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  allowlist_agent_ids: string[];
  denylist_agent_ids: string[];
};

type PolicyDecision = {
  decision_id: string;
  ts: string | null;
  agent_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  outcome: string | null;
  decision: string;
  policy_version: number | null;
  approval_id: string | null;
  request_id: string | null;
  receipt_url: string | null;
};

type PolicyForm = {
  hardCeiling: string;
  preferredOffer: string;
  approvalThreshold: string;
  currency: string;
  radiusKm: string;
  autonomousActions: string[];
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  allowlist: string;
  denylist: string;
};

const AUTONOMOUS_ACTION_OPTIONS: Array<{
  value: "search" | "ask_question" | "make_offer";
  label: string;
  hint: string;
  locked?: boolean;
}> = [
  {
    value: "search",
    label: "Search and rank listings",
    hint: "Always on: every Deal Mission needs search.",
    locked: true
  },
  {
    value: "ask_question",
    label: "Ask the seller questions",
    hint: "Messages continue through server-side redaction."
  },
  {
    value: "make_offer",
    label: "Make policy-compliant offers",
    hint: "Your hard ceiling and approval threshold still apply."
  }
];

const DEFAULT_FORM: PolicyForm = {
  hardCeiling: "",
  preferredOffer: "",
  approvalThreshold: "",
  currency: "EUR",
  radiusKm: "25",
  autonomousActions: ["search", "ask_question", "make_offer"],
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  timezone: "UTC",
  allowlist: "",
  denylist: ""
};

function numberInput(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAgentIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function hydrateForm(policy: PolicyData): PolicyForm {
  const actions = Array.isArray(policy?.mission_defaults?.autonomous_actions)
    ? policy.mission_defaults.autonomous_actions
    : [];
  return {
    hardCeiling: numberInput(policy?.budgets?.max_offer),
    preferredOffer: numberInput(policy?.budgets?.preferred_offer),
    approvalThreshold: numberInput(policy?.approval_thresholds?.offer_amount_gt),
    currency: policy?.budgets?.currency || "EUR",
    radiusKm: numberInput(policy?.mission_defaults?.radius_km) || "25",
    autonomousActions: Array.from(new Set(["search", ...actions])),
    quietEnabled: policy?.quiet_hours?.enabled === true,
    quietStart: policy?.quiet_hours?.start || "22:00",
    quietEnd: policy?.quiet_hours?.end || "08:00",
    timezone: policy?.quiet_hours?.timezone || "UTC",
    allowlist: Array.isArray(policy?.allowlist_agent_ids) ? policy.allowlist_agent_ids.join("\n") : "",
    denylist: Array.isArray(policy?.denylist_agent_ids) ? policy.denylist_agent_ids.join("\n") : ""
  };
}

function getErrorMessage(body: any, status: number): string {
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  if (details.length > 0 && details[0]?.message) return String(details[0].message);
  return body?.error?.message || body?.message || `HTTP ${status}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function decisionReceiptShape(decision: string) {
  if (decision === "AUTO_APPROVED") return { decision: "server_accepted" };
  if (decision === "REQUIRES_APPROVAL") {
    return { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" };
  }
  if (decision === "DENIED") return { decision: "server_rejected", error_code: "FORBIDDEN" };
  return { decision: decision.toLowerCase() };
}

function decisionClasses(tone: "neutral" | "ok" | "warn" | "error") {
  if (tone === "ok") return "border-success/30 bg-success/8 text-success";
  if (tone === "warn") return "border-warning/30 bg-warning/8 text-warning";
  if (tone === "error") return "border-error/30 bg-error/8 text-error";
  return "border-border bg-bg/50 text-muted";
}

function sectionTitle(icon: ReactNode, eyebrow: string, title: string, description: string) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-9 w-9 shrink-0 border border-primary/30 bg-primary/8 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-base font-bold uppercase tracking-wide text-text">{title}</h2>
        <p className="mt-1 max-w-2xl text-xs font-mono leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  );
}

export default function PolicyPage() {
  const router = useRouter();
  const tWebMcp = useTranslations("webmcp");
  const { toasts, show } = useToast();
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [form, setForm] = useState<PolicyForm>(DEFAULT_FORM);
  const [decisions, setDecisions] = useState<PolicyDecision[]>([]);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const redirectToLogin = useCallback(() => {
    const next = encodeURIComponent(router.asPath || "/settings/policy");
    void router.replace(`/auth/login?next=${next}`);
  }, [router]);

  const loadPolicy = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setError(null);

    try {
      const sessionResp = await fetch("/api/v1/auth/session", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
      const sessionBody = await sessionResp.json().catch(() => ({}));
      if (sessionResp.status === 401 || sessionBody?.data?.authenticated === false) {
        redirectToLogin();
        return;
      }
      if (!sessionResp.ok) throw new Error(getErrorMessage(sessionBody, sessionResp.status));

      const [policyResp, decisionsResp] = await Promise.all([
        fetch("/api/v1/policies", { credentials: "include", cache: "no-store", signal: controller.signal }),
        fetch("/api/v1/owner/policy-decisions?limit=20", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal
        })
      ]);
      const [policyBody, decisionsBody] = await Promise.all([
        policyResp.json().catch(() => ({})),
        decisionsResp.json().catch(() => ({}))
      ]);

      if (policyResp.status === 401 || decisionsResp.status === 401) {
        redirectToLogin();
        return;
      }
      if (!policyResp.ok) throw new Error(getErrorMessage(policyBody, policyResp.status));
      if (!decisionsResp.ok) throw new Error(getErrorMessage(decisionsBody, decisionsResp.status));

      const nextPolicy = policyBody?.data as PolicyData;
      setPolicy(nextPolicy);
      setForm(hydrateForm(nextPolicy));
      setDecisions(Array.isArray(decisionsBody?.data?.decisions) ? decisionsBody.data.decisions : []);
      setState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState("error");
      setError(String(err?.message || "Failed to load policy controls"));
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void loadPolicy();
    return () => abortRef.current?.abort();
  }, [loadPolicy]);

  const policyDraft = useMemo(() => {
    const current = policy || ({} as PolicyData);
    return {
      ...current,
      version: policy?.version || 1,
      budgets: {
        ...(current.budgets || {}),
        max_offer: parseOptionalNumber(form.hardCeiling),
        preferred_offer: parseOptionalNumber(form.preferredOffer),
        currency: form.currency
      },
      approval_thresholds: {
        ...(current.approval_thresholds || {}),
        offer_amount_gt: parseOptionalNumber(form.approvalThreshold),
        contact_reveal: current.approval_thresholds?.contact_reveal || "always"
      },
      auto_approve: current.auto_approve || { message_types: [], actions: [] },
      mission_defaults: {
        radius_km: Number(form.radiusKm),
        autonomous_actions: form.autonomousActions
      },
      quiet_hours: {
        enabled: form.quietEnabled,
        start: form.quietStart,
        end: form.quietEnd,
        timezone: form.timezone.trim()
      },
      allowlist_agent_ids: parseAgentIds(form.allowlist),
      denylist_agent_ids: parseAgentIds(form.denylist)
    };
  }, [form, policy]);

  const previewDecision = useMemo(
    () =>
      evaluatePolicyAction({
        policy: policyDraft,
        action: "offer.create",
        offerAmount: 1200,
        offerCurrency: form.currency
      }),
    [form.currency, policyDraft]
  );
  const previewChip = describePolicyDecision(decisionReceiptShape(previewDecision.decision));

  const savePolicy = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!policy || saveState === "saving") return;
      setSaveState("saving");
      setError(null);

      try {
        const resp = await fetch("/api/v1/policies", {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(policy.version)
          },
          body: JSON.stringify(policyDraft)
        });
        const body = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          redirectToLogin();
          return;
        }
        if (!resp.ok) throw new Error(getErrorMessage(body, resp.status));

        const nextPolicy = body.data as PolicyData;
        setPolicy(nextPolicy);
        setForm(hydrateForm(nextPolicy));
        show(`Policy v${nextPolicy.version} saved`, "success");
      } catch (err: any) {
        const message = String(err?.message || "Policy update failed");
        setError(message);
        show(message, "error");
      } finally {
        setSaveState("idle");
      }
    },
    [policy, policyDraft, redirectToLogin, saveState, show]
  );

  const updateForm = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleAutonomousAction = (value: string, checked: boolean) => {
    setForm((current) => {
      const next = new Set(current.autonomousActions);
      if (checked) next.add(value);
      else next.delete(value);
      next.add("search");
      return {
        ...current,
        autonomousActions: AUTONOMOUS_ACTION_OPTIONS.map((option) => option.value).filter((action) => next.has(action))
      };
    });
  };

  return (
    <div data-testid="policy-page" className="min-h-screen bg-bg">
      <PageHeader title="POLICY CONTROL" containerClassName="px-6 pt-4">
        <AppNav current="settings" />
        <SettingsNav current="policy" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-6 py-6">
        {state === "loading" ? (
          <div data-testid="policy-loading" className="flex items-center gap-3 py-12 text-sm font-mono text-subtle">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            Loading your guardrails…
          </div>
        ) : null}

        {state === "error" ? (
          <section data-testid="policy-error" className="border border-error/30 bg-error/5 p-5">
            <p className="text-sm font-bold text-error">Policy controls could not load</p>
            <p className="mt-2 text-xs font-mono text-muted">{error}</p>
            <button
              type="button"
              onClick={() => void loadPolicy()}
              className="mt-4 border border-error/40 px-3 py-2 text-xs font-mono font-bold uppercase text-error hover:bg-error/10"
            >
              Retry
            </button>
          </section>
        ) : null}

        {state === "done" && policy ? (
          <form onSubmit={savePolicy} data-testid="policy-form" className="space-y-6">
            <section className="relative overflow-hidden border border-primary/30 bg-surface/70 p-5">
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">Active owner policy</p>
                  <h1 className="mt-1 text-xl font-bold uppercase tracking-wide text-text">Set the limits. Keep the final say.</h1>
                  <p className="mt-2 max-w-2xl text-xs font-mono leading-relaxed text-muted">
                    Changes are enforced by the API on the next action. Deal Missions may set a tighter per-mission ceiling.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="border border-border bg-bg/60 px-3 py-2 text-xs font-mono text-subtle">
                    VERSION <strong className="text-text">{policy.version}</strong>
                  </span>
                  <button
                    type="submit"
                    data-testid="policy-save"
                    disabled={saveState === "saving"}
                    className="inline-flex items-center gap-2 border border-primary bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-bg hover:bg-text hover:border-text disabled:opacity-50"
                  >
                    <Save size={14} />
                    {saveState === "saving" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </section>

            {error ? (
              <div role="alert" className="border border-error/30 bg-error/5 px-4 py-3 text-xs font-mono text-error">
                {error}
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
              <div className="space-y-6">
                <section className="border border-border bg-surface/50 p-5" data-testid="policy-budget-section">
                  {sectionTitle(
                    <SlidersHorizontal size={17} />,
                    "01 // spend",
                    "Budget and approvals",
                    "The hard ceiling blocks autonomous execution. The approval threshold can stop an offer earlier for your review."
                  )}
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">Preferred offer</span>
                      <input
                        name="preferred_offer"
                        data-testid="policy-preferred-offer"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preferredOffer}
                        onChange={(event) => updateForm("preferredOffer", event.target.value)}
                        placeholder="1200"
                        className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text focus:border-primary focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">Hard ceiling</span>
                      <input
                        name="max_offer"
                        data-testid="policy-hard-ceiling"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.hardCeiling}
                        onChange={(event) => updateForm("hardCeiling", event.target.value)}
                        placeholder="1300"
                        className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text focus:border-primary focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">Approval above</span>
                      <input
                        name="offer_amount_gt"
                        data-testid="policy-approval-threshold"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.approvalThreshold}
                        onChange={(event) => updateForm("approvalThreshold", event.target.value)}
                        placeholder="1200"
                        className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text focus:border-primary focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">Currency</span>
                      <select
                        name="currency"
                        value={form.currency}
                        onChange={(event) => updateForm("currency", event.target.value)}
                        className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text focus:border-primary focus:outline-none"
                      >
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="border border-border bg-surface/50 p-5" data-testid="policy-autonomy-section">
                  {sectionTitle(
                    <ShieldCheck size={17} />,
                    "02 // autonomy",
                    "Deal Mission defaults",
                    "These defaults mirror the visible Deal Mission controls. You can still tighten them before each mission starts."
                  )}
                  <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                    <fieldset>
                      <legend className="sr-only">Autonomous actions</legend>
                      <div className="space-y-2">
                        {AUTONOMOUS_ACTION_OPTIONS.map((option) => {
                          const checked = form.autonomousActions.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className="flex items-start gap-3 border border-border bg-bg/50 px-3 py-2.5 text-xs font-mono text-text"
                            >
                              <input
                                type="checkbox"
                                name="autonomous_actions"
                                value={option.value}
                                checked={option.locked ? true : checked}
                                disabled={option.locked}
                                onChange={(event) => toggleAutonomousAction(option.value, event.target.checked)}
                                className="mt-0.5 accent-[var(--color-primary)]"
                              />
                              <span>
                                <strong className="font-medium">{option.label}</strong>
                                <span className="mt-0.5 block text-subtle">{option.hint}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    <label className="space-y-1.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-subtle">
                        <MapPin size={12} /> Default radius
                      </span>
                      <div className="relative">
                        <input
                          name="radius_km"
                          data-testid="policy-radius"
                          required
                          type="number"
                          min="1"
                          max="300"
                          step="1"
                          value={form.radiusKm}
                          onChange={(event) => updateForm("radiusKm", event.target.value)}
                          className="w-full border border-border bg-bg px-3 py-2 pr-10 text-sm font-mono text-text focus:border-primary focus:outline-none"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-mono text-subtle">km</span>
                      </div>
                    </label>
                  </div>
                </section>

                <section className="border border-border bg-surface/50 p-5" data-testid="policy-agent-lists-section">
                  {sectionTitle(
                    <ShieldCheck size={17} />,
                    "03 // counterparties",
                    "Seller agent lists",
                    "The denylist always wins. Leave the allowlist empty to accept any seller agent that is not denied."
                  )}
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-success">Allowlist</span>
                      <textarea
                        name="allowlist_agent_ids"
                        data-testid="policy-allowlist"
                        rows={5}
                        value={form.allowlist}
                        onChange={(event) => updateForm("allowlist", event.target.value)}
                        placeholder="One agent ID per line"
                        className="w-full resize-y border border-border bg-bg px-3 py-2 text-xs font-mono text-text focus:border-success focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-error">Denylist</span>
                      <textarea
                        name="denylist_agent_ids"
                        data-testid="policy-denylist"
                        rows={5}
                        value={form.denylist}
                        onChange={(event) => updateForm("denylist", event.target.value)}
                        placeholder="One agent ID per line"
                        className="w-full resize-y border border-border bg-bg px-3 py-2 text-xs font-mono text-text focus:border-error focus:outline-none"
                      />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <section className="border border-warning/30 bg-warning/5 p-5" data-testid="policy-preview">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-warning">Live decision preview</p>
                    <span className="text-[10px] font-mono text-subtle">SERVER RULES</span>
                  </div>
                  <p className="mt-4 text-sm font-medium leading-relaxed text-text">
                    With these rules, a {form.currency} 1,200 offer on the used e-bike would be:
                  </p>
                  <div
                    data-testid="policy-preview-decision"
                    className={`mt-3 inline-flex border px-3 py-2 text-xs font-mono font-bold uppercase ${decisionClasses(previewChip.tone)}`}
                  >
                    {previewDecision.decision === POLICY_DECISION.REQUIRES_APPROVAL
                      ? "APPROVAL_REQUIRED"
                      : tWebMcp(previewChip.labelKey, previewChip.values)}
                  </div>
                  <p className="mt-3 text-xs font-mono text-subtle">Reason: {previewDecision.reason}</p>
                </section>

                <section className="border border-border bg-surface/50 p-5" data-testid="policy-quiet-hours-section">
                  {sectionTitle(
                    <Clock3 size={17} />,
                    "04 // schedule",
                    "Quiet hours",
                    "Store the default owner window used by connected clients when they schedule autonomous work."
                  )}
                  <label className="mt-5 flex items-center justify-between gap-4 border border-border bg-bg/50 px-3 py-2.5 text-xs font-mono text-text">
                    <span>Enable quiet hours</span>
                    <input
                      name="quiet_enabled"
                      type="checkbox"
                      checked={form.quietEnabled}
                      onChange={(event) => updateForm("quietEnabled", event.target.checked)}
                      className="accent-[var(--color-primary)]"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase text-subtle">From</span>
                      <input
                        name="quiet_start"
                        type="time"
                        value={form.quietStart}
                        disabled={!form.quietEnabled}
                        onChange={(event) => updateForm("quietStart", event.target.value)}
                        className="w-full border border-border bg-bg px-3 py-2 text-xs font-mono text-text disabled:opacity-50"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-mono uppercase text-subtle">Until</span>
                      <input
                        name="quiet_end"
                        type="time"
                        value={form.quietEnd}
                        disabled={!form.quietEnabled}
                        onChange={(event) => updateForm("quietEnd", event.target.value)}
                        className="w-full border border-border bg-bg px-3 py-2 text-xs font-mono text-text disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-subtle">Timezone</span>
                    <input
                      name="timezone"
                      value={form.timezone}
                      onChange={(event) => updateForm("timezone", event.target.value)}
                      placeholder="Europe/Paris"
                      className="w-full border border-border bg-bg px-3 py-2 text-xs font-mono text-text focus:border-primary focus:outline-none"
                    />
                  </label>
                </section>
              </aside>
            </div>

            <section id="decision-history" className="border border-border bg-surface/50" data-testid="policy-history">
              <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                {sectionTitle(
                  <Activity size={17} />,
                  "05 // audit",
                  "Recent policy decisions",
                  "The latest 20 decisions emitted by agents that belong to this owner."
                )}
                <span className="text-xs font-mono text-subtle">{decisions.length} decisions</span>
              </div>
              {decisions.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs font-mono text-subtle">No policy decisions recorded yet.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {decisions.map((decision) => {
                    const chip = describePolicyDecision(decisionReceiptShape(decision.decision));
                    return (
                      <article key={decision.decision_id} className="grid gap-3 px-5 py-4 hover:bg-bg/30 md:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-text">{decision.action}</strong>
                            <span className={`border px-2 py-0.5 text-[10px] font-mono uppercase ${decisionClasses(chip.tone)}`}>
                              {tWebMcp(chip.labelKey, chip.values)}
                            </span>
                            {decision.policy_version !== null ? (
                              <span className="text-[10px] font-mono text-subtle">v{decision.policy_version}</span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 truncate text-xs font-mono text-subtle">
                            agent {decision.agent_id || "—"}
                            {decision.entity_type ? ` · ${decision.entity_type} ${decision.entity_id || ""}` : ""}
                          </p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="text-xs font-mono text-subtle">{formatDate(decision.ts)}</p>
                          {decision.request_id && decision.receipt_url ? (
                            <Link
                              href={decision.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex text-xs font-mono text-primary hover:underline"
                            >
                              Receipt {decision.request_id.slice(0, 12)}…
                            </Link>
                          ) : (
                            <span className="mt-1 inline-flex text-xs font-mono text-subtle">No request ID</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </form>
        ) : null}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
