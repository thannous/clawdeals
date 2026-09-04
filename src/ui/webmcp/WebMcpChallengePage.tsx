import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bot,
  Check,
  Clipboard,
  Database,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  Play,
  Radio,
  ShieldCheck,
  UserRound
} from "lucide-react";

import { useTheme } from "../../theme/theme-context";
import { NavbarCurrent } from "../landing/Navbar";
import ThreeIdeasGrid, { type ThreeIdea } from "../shared/ThreeIdeasGrid";
import { useWebMcp } from "../../webmcp/WebMcpProvider";
import { getToolsForRoute } from "../../webmcp/tools";
import {
  getStoredApiKey,
  subscribeStoredApiKey
} from "../developer/storage";
import AgentKeyConnect from "./AgentKeyConnect";
import BrowserRegistryCard from "./BrowserRegistryCard";
import CatalogAvailabilityNotice from "./CatalogAvailabilityNotice";
import JudgeResetButton from "./JudgeResetButton";
import MissionMilestones from "./MissionMilestones";
import PendingApprovalBanner from "./PendingApprovalBanner";
import SellerTurnButton from "./SellerTurnButton";
import { useJudgeReset } from "./useJudgeReset";

const REPO_URL = "https://github.com/thannous/clawdeals";
const HACKATHON_DOC_URL = `${REPO_URL}/blob/main/HACKATHON.md`;
const JUDGE_GUIDE_URL = `${REPO_URL}/blob/main/docs/hackathon/JUDGE_GUIDE.md`;
const EVALS_URL = `${REPO_URL}/tree/main/evals/webmcp`;
const PLAN_URL = `${REPO_URL}/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md`;
const VIDEO_URL = "https://youtu.be/ePgP4IO_qM8";
const SANDBOX_URL = "https://sandbox.clawdeals.com/webmcp-challenge";
const CHROME_WEBMCP_DOCS_URL = "https://developer.chrome.com/docs/ai/webmcp";

function statusTone(active: boolean) {
  return active
    ? "border-success/40 bg-success/10 text-success"
    : "border-border bg-surface text-muted";
}

function EvidenceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

export default function WebMcpChallengePage({ deploySha = null }: { deploySha?: string | null }) {
  const t = useTranslations("webmcp");
  const { themeId, setTheme, themes } = useTheme();
  const { enabled, supported, registered, registeredToolNames, lastRegisterError } = useWebMcp();
  const apiKey = useSyncExternalStore(subscribeStoredApiKey, getStoredApiKey, () => null);
  const expectedTools = useMemo(
    () => getToolsForRoute("/webmcp-challenge", { hasAgentKey: Boolean(apiKey) }),
    [apiKey]
  );
  const judgeReset = useJudgeReset(apiKey);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const judgePrompt = t("challenge.prompt");
  const threeIdeas = useMemo<ThreeIdea[]>(
    () => [1, 2, 3].map((index) => ({
      title: t(`challenge.ideas.${index}.title`),
      body: t(`challenge.ideas.${index}.body`)
    })),
    [t]
  );
  const sixtySecondSteps = useMemo(
    () => [1, 2, 3, 4].map((index) => ({
      title: t(`challenge.steps.${index}.title`),
      copy: t(`challenge.steps.${index}.copy`)
    })),
    [t]
  );

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(judgePrompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [judgePrompt]);

  return (
    <div className="min-h-screen bg-bg text-text" data-testid="webmcp-challenge-page">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />
      <PendingApprovalBanner />

      <main id="main-content" tabIndex={-1} className="pb-20 pt-24">
        <section className="mx-auto grid max-w-[1440px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              {t("challenge.badge")}
            </div>
            <h1 className="max-w-5xl text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              {t("challenge.heroTitle")}
              <span className="block text-primary">{t("challenge.heroAccent")}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-text sm:text-lg" data-testid="webmcp-challenge-pitch">
              {t("challenge.pitch")}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
              {t("challenge.intro")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/webmcp"
                data-testid="webmcp-challenge-launch"
                className="inline-flex h-12 items-center gap-2 bg-primary px-5 font-mono text-xs font-bold uppercase tracking-widest text-bg transition hover:brightness-110"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t("challenge.launch")}
              </Link>
              <button
                type="button"
                data-testid="webmcp-challenge-copy-prompt"
                onClick={copyPrompt}
                className="inline-flex h-12 items-center gap-2 border border-border-strong bg-surface px-5 font-mono text-xs font-bold uppercase tracking-widest text-text transition hover:border-primary hover:text-primary"
              >
                {copyState === "copied" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {copyState === "copied" ? t("challenge.promptCopied") : copyState === "failed" ? t("common.copyFailed") : t("challenge.copyJudgePrompt")}
              </button>
              <a
                href={VIDEO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 border border-border px-5 font-mono text-xs font-bold uppercase tracking-widest text-muted transition hover:border-primary hover:text-primary"
              >
                {t("challenge.watchDemo")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="border border-border bg-surface p-5" aria-label={t("challenge.compatibility.ariaLabel")}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("challenge.compatibility.title")}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className={`border p-3 ${statusTone(enabled)}`}>
                <p className="font-mono text-[10px] uppercase tracking-widest">{t("challenge.compatibility.runtime")}</p>
                <p className="mt-1 text-sm font-bold">{enabled ? t("common.enabled") : t("common.disabled")}</p>
              </div>
              <div className={`border p-3 ${statusTone(supported)}`} data-testid="webmcp-challenge-supported">
                <p className="font-mono text-[10px] uppercase tracking-widest">{t("challenge.compatibility.browserApi")}</p>
                <p className="mt-1 text-sm font-bold">{supported ? t("common.supported") : t("common.notDetected")}</p>
              </div>
              <div className={`col-span-2 border p-3 ${statusTone(registered)}`} data-testid="webmcp-challenge-registered">
                <p className="font-mono text-[10px] uppercase tracking-widest">{t("challenge.compatibility.registry")}</p>
                <p className="mt-1 text-sm font-bold">
                  {registered ? t("challenge.compatibility.toolsRegistered", { count: registeredToolNames.length }) : t("challenge.compatibility.noRegistration")}
                </p>
              </div>
            </div>
            {lastRegisterError ? (
              <p className="mt-3 text-xs text-error">
                {lastRegisterError.kind === "partial"
                  ? t("status.registrationPartial", { count: lastRegisterError.count })
                  : t("status.registrationFailed")}
              </p>
            ) : null}
          </aside>
        </section>

        <section className="mx-auto mt-14 max-w-[1440px] px-4 sm:px-6" aria-labelledby="judge-60s-title">
          <div className="border border-primary/40 bg-primary/5 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{t("challenge.startHere")}</p>
                <h2 id="judge-60s-title" className="mt-2 text-3xl font-bold uppercase">
                  {t("challenge.judge60")}
                </h2>
              </div>
              <div className="flex flex-wrap gap-4">
                <EvidenceLink href={SANDBOX_URL} label={t("challenge.links.sandbox")} />
                <EvidenceLink href={JUDGE_GUIDE_URL} label={t("challenge.links.guide")} />
                <EvidenceLink href={CHROME_WEBMCP_DOCS_URL} label={t("challenge.links.chromeDocs")} />
              </div>
            </div>
            <CatalogAvailabilityNotice />
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="webmcp-challenge-60s">
              {sixtySecondSteps.map((step, index) => (
                <li key={step.title} className="border border-border bg-surface p-4">
                  <p className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 font-bold uppercase">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-6">
          <ThreeIdeasGrid items={threeIdeas} ariaLabel={t("challenge.ideas.ariaLabel")} headingLevel="h2" />
        </section>

        <section className="mx-auto mt-16 grid max-w-[1440px] gap-4 px-4 sm:px-6 lg:grid-cols-3">
          <article className="border border-border bg-surface p-5">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">{t("challenge.roles.agent.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("challenge.roles.agent.copy")}</p>
          </article>
          <article className="border border-border bg-surface p-5">
            <UserRound className="h-5 w-5 text-secondary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">{t("challenge.roles.owner.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("challenge.roles.owner.copy")}</p>
          </article>
          <article className="border border-border bg-surface p-5">
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">ClawDeals</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("challenge.roles.clawdeals.copy")}</p>
          </article>
        </section>

        <section className="mx-auto mt-16 grid max-w-[1440px] gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className="border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("challenge.fixture.eyebrow")}</p>
                <h2 className="mt-2 text-2xl font-bold uppercase">{t("challenge.fixture.title")}</h2>
              </div>
              <Database className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {t("challenge.fixture.description")}
            </p>
            <div className="mt-5 border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.fixture.judgeKey")}</p>
              <div className="mt-2">
                <AgentKeyConnect compact />
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <JudgeResetButton {...judgeReset} />
            </div>
            {judgeReset.capability.authorized ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.fixture.seller")}</p>
                <SellerTurnButton apiKey={apiKey} />
              </div>
            ) : null}
          </div>

          <div className="grid gap-6">
            <div className="border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("challenge.registry.eyebrow")}</p>
                  <h2 className="mt-2 text-2xl font-bold uppercase">{t("challenge.registry.title")}</h2>
                </div>
                <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                  document.modelContext
                </div>
              </div>
              <div className="mt-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.registry.registeredNow")}</p>
                <ul className="mt-2 flex flex-wrap gap-2" data-testid="webmcp-challenge-registered-tools">
                  {registeredToolNames.length ? (
                    registeredToolNames.map((name) => (
                      <li key={name} data-testid="webmcp-challenge-registered-tool" className="border border-success/40 bg-success/10 px-2.5 py-1 font-mono text-[11px] text-success">
                        {name}
                      </li>
                    ))
                  ) : (
                    <li className="border border-border px-2.5 py-1 font-mono text-[11px] text-subtle">{t("challenge.registry.none")}</li>
                  )}
                </ul>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.registry.expected")}</p>
                <p className="mt-2 font-mono text-xs leading-relaxed text-muted" data-testid="webmcp-challenge-expected-tools">
                  {expectedTools.map((tool) => tool.name).join(" · ")}
                </p>
              </div>
            </div>
            <BrowserRegistryCard providerToolNames={registeredToolNames} />
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-6">
          <div className="border border-primary/40 bg-primary/5 p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{t("challenge.copyExact")}</p>
                <blockquote className="mt-3 max-w-5xl text-sm leading-relaxed text-text sm:text-base" data-testid="webmcp-challenge-prompt">
                  “{judgePrompt}”
                </blockquote>
              </div>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex h-11 items-center justify-center gap-2 border border-primary px-4 font-mono text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-bg"
              >
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                {t("challenge.copyPrompt")}
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-6">
          <MissionMilestones />
        </section>

        <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("challenge.eligibility.eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-bold uppercase">{t("challenge.eligibility.title")}</h2>
            </div>
            <EvidenceLink href={HACKATHON_DOC_URL} label={t("challenge.links.ledger")} />
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted">
            {t("challenge.eligibility.description")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", t("challenge.eligibility.items.1.title"), t("challenge.eligibility.items.1.copy")],
              ["02", t("challenge.eligibility.items.2.title"), t("challenge.eligibility.items.2.copy")],
              ["03", t("challenge.eligibility.items.3.title"), t("challenge.eligibility.items.3.copy")],
              ["04", t("challenge.eligibility.items.4.title"), t("challenge.eligibility.items.4.copy")]
            ].map(([index, title, copy]) => (
              <article key={index} className="border border-border bg-surface p-5">
                <p className="font-mono text-xs text-primary">{index}</p>
                <h3 className="mt-4 font-bold uppercase">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-6">
          <div className="grid gap-4 border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
            <div>
              <LockKeyhole className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.evidence.baseline")}</p>
              <p className="mt-1 break-all font-mono text-xs text-text">00880457964929c0773237a9c724704f5da651f0</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.evidence.deployedBuild")}</p>
              <p className="mt-1 break-all font-mono text-xs text-text" data-testid="webmcp-challenge-deploy-sha">
                {deploySha ? deploySha.slice(0, 12) : t("common.unavailable")}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.evidence.title")}</p>
              <div className="mt-3 space-y-2">
                <EvidenceLink href={REPO_URL} label={t("challenge.links.repository")} />
                <br />
                <EvidenceLink href={EVALS_URL} label={t("challenge.links.evals")} />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.evidence.strategy")}</p>
              <div className="mt-3">
                <EvidenceLink href={PLAN_URL} label={t("challenge.links.plan")} />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">{t("challenge.evidence.productPath")}</p>
              <Link href="/webmcp" className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline">
                {t("challenge.openMarketplace")}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
