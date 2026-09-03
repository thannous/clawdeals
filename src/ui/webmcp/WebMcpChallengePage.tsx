import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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
import { useWebMcp } from "../../webmcp/WebMcpProvider";
import { getToolsForRoute } from "../../webmcp/tools";
import {
  getStoredApiKey,
  subscribeStoredApiKey
} from "../developer/storage";
import AgentKeyConnect from "./AgentKeyConnect";
import BrowserRegistryCard from "./BrowserRegistryCard";
import JudgeResetButton from "./JudgeResetButton";
import MissionMilestones from "./MissionMilestones";
import PendingApprovalBanner from "./PendingApprovalBanner";
import SellerTurnButton from "./SellerTurnButton";
import { useJudgeReset } from "./useJudgeReset";

export const JUDGE_PROMPT = `Create a BUY mission for a used e-bike within 25 km of Paris. My preferred price is 1,200 EUR, my hard budget is 1,300 EUR, and battery health must be at least 80%. Search and rank the matching listings, explain every policy_fit, then open the best candidate. Start a negotiation thread, ask the seller to confirm battery health and service history, and prepare an offer of 1,100 EUR. Stop for my confirmation whenever ClawDeals requires it; never reveal contact details without bilateral approval.`;

export const PITCH =
  "ClawDeals lets buyer and seller agents negotiate a real deal while humans keep control of budgets, approvals and identity.";

const REPO_URL = "https://github.com/thannous/clawdeals";
const HACKATHON_DOC_URL = `${REPO_URL}/blob/main/HACKATHON.md`;
const JUDGE_GUIDE_URL = `${REPO_URL}/blob/main/docs/hackathon/JUDGE_GUIDE.md`;
const EVALS_URL = `${REPO_URL}/tree/main/evals/webmcp`;
const PLAN_URL = `${REPO_URL}/blob/main/docs/hackathon/plan-de-victoire-webmcp-challenge.md`;
const VIDEO_URL = "https://youtu.be/mjNd6BNk_0U";
const SANDBOX_URL = "https://sandbox.clawdeals.com/webmcp-challenge";
const CHROME_WEBMCP_DOCS_URL = "https://developer.chrome.com/docs/ai/webmcp";

const THREE_IDEAS = [
  ["01", "The agent negotiates", "It searches, ranks, asks the seller and prepares offers through page-scoped WebMCP tools."],
  ["02", "The server enforces human limits", "Hard budgets, owner-only approvals and bilateral consent are checked again server-side."],
  ["03", "Every action stays verifiable", "Each protected step leaves a redacted receipt with a request ID and a policy decision."]
] as const;

const SIXTY_SECOND_STEPS = [
  {
    title: "Open this hub in a WebMCP client",
    copy: "ChatGPT's in-app browser, or Chrome 149+ with chrome://flags/#enable-webmcp-testing (the Model Context Tool Inspector extension also works)."
  },
  {
    title: "Copy the mission prompt",
    copy: "One paragraph: Paris e-bike, preferred 1,200 EUR, hard budget 1,300 EUR, battery ≥ 80%, offer 1,100 EUR."
  },
  {
    title: "Watch the registry",
    copy: "5 public tools without a key; 11 contextual tools once the synthetic judge key is connected on the sandbox."
  },
  {
    title: "Look for three outcomes",
    copy: "APPROVAL_REQUIRED on 1,350 EUR, RESERVED after the seller accepts, and a redacted receipt you can read back."
  }
] as const;

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
  const { themeId, setTheme, themes } = useTheme();
  const { enabled, supported, registered, registeredToolNames, lastRegisterError } = useWebMcp();
  const apiKey = useSyncExternalStore(subscribeStoredApiKey, getStoredApiKey, () => null);
  const expectedTools = useMemo(
    () => getToolsForRoute("/webmcp-challenge", { hasAgentKey: Boolean(apiKey) }),
    [apiKey]
  );
  const judgeReset = useJudgeReset(apiKey);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JUDGE_PROMPT);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text" data-testid="webmcp-challenge-page">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />
      <PendingApprovalBanner />

      <main id="main-content" tabIndex={-1} className="pb-20 pt-24">
        <section className="mx-auto grid max-w-[1440px] gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              WebMCP Challenge · Judge mode
            </div>
            <h1 className="max-w-5xl text-4xl font-bold uppercase leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              Your agent negotiates.
              <span className="block text-primary">You stay in control.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-text sm:text-lg" data-testid="webmcp-challenge-pitch">
              {PITCH}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
              Built for second-hand marketplaces between individuals, where negotiation is asynchronous, scams and leaked
              contact details are the first risk, and an agent without server-enforced limits is unusable. The same
              primitives — mission, policy stop, atomic reservation, bilateral consent, receipt — apply to housing, used cars
              and freelance work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/webmcp"
                data-testid="webmcp-challenge-launch"
                className="inline-flex h-12 items-center gap-2 bg-primary px-5 font-mono text-xs font-bold uppercase tracking-widest text-bg transition hover:brightness-110"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Launch live demo
              </Link>
              <button
                type="button"
                data-testid="webmcp-challenge-copy-prompt"
                onClick={copyPrompt}
                className="inline-flex h-12 items-center gap-2 border border-border-strong bg-surface px-5 font-mono text-xs font-bold uppercase tracking-widest text-text transition hover:border-primary hover:text-primary"
              >
                {copyState === "copied" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {copyState === "copied" ? "Prompt copied" : copyState === "failed" ? "Copy failed" : "Copy judge prompt"}
              </button>
              <a
                href={VIDEO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 border border-border px-5 font-mono text-xs font-bold uppercase tracking-widest text-muted transition hover:border-primary hover:text-primary"
              >
                Watch the 160 s demo
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="border border-border bg-surface p-5" aria-label="WebMCP compatibility">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Live compatibility</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className={`border p-3 ${statusTone(enabled)}`}>
                <p className="font-mono text-[10px] uppercase tracking-widest">Runtime</p>
                <p className="mt-1 text-sm font-bold">{enabled ? "Enabled" : "Disabled"}</p>
              </div>
              <div className={`border p-3 ${statusTone(supported)}`} data-testid="webmcp-challenge-supported">
                <p className="font-mono text-[10px] uppercase tracking-widest">Browser API</p>
                <p className="mt-1 text-sm font-bold">{supported ? "Supported" : "Not detected"}</p>
              </div>
              <div className={`col-span-2 border p-3 ${statusTone(registered)}`} data-testid="webmcp-challenge-registered">
                <p className="font-mono text-[10px] uppercase tracking-widest">Registry</p>
                <p className="mt-1 text-sm font-bold">
                  {registered ? `${registeredToolNames.length} tools registered` : "No active registration"}
                </p>
              </div>
            </div>
            {lastRegisterError ? <p className="mt-3 text-xs text-error">{lastRegisterError}</p> : null}
          </aside>
        </section>

        <section className="mx-auto mt-14 max-w-[1440px] px-4 sm:px-6" aria-labelledby="judge-60s-title">
          <div className="border border-primary/40 bg-primary/5 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Start here</p>
                <h2 id="judge-60s-title" className="mt-2 text-3xl font-bold uppercase">
                  Judge in 60 seconds
                </h2>
              </div>
              <div className="flex flex-wrap gap-4">
                <EvidenceLink href={SANDBOX_URL} label="Authenticated sandbox" />
                <EvidenceLink href={JUDGE_GUIDE_URL} label="Full judge guide" />
                <EvidenceLink href={CHROME_WEBMCP_DOCS_URL} label="Chrome WebMCP docs" />
              </div>
            </div>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="webmcp-challenge-60s">
              {SIXTY_SECOND_STEPS.map((step, index) => (
                <li key={step.title} className="border border-border bg-surface p-4">
                  <p className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 font-bold uppercase">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-[1440px] gap-4 px-4 sm:px-6 lg:grid-cols-3" aria-label="Three ideas">
          {THREE_IDEAS.map(([index, title, copy]) => (
            <article key={index} className="border border-border bg-surface p-5">
              <p className="font-mono text-xs text-primary">{index}</p>
              <h2 className="mt-4 text-lg font-bold uppercase">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-16 grid max-w-[1440px] gap-4 px-4 sm:px-6 lg:grid-cols-3">
          <article className="border border-border bg-surface p-5">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">Agent</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">Searches, compares, starts threads, asks questions and prepares offers.</p>
          </article>
          <article className="border border-border bg-surface p-5">
            <UserRound className="h-5 w-5 text-secondary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">Owner</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">Defines the mission and budget, edits sensitive actions and keeps the final say.</p>
          </article>
          <article className="border border-border bg-surface p-5">
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold uppercase">ClawDeals</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">Enforces policy server-side, controls contact reveal and emits redacted action receipts.</p>
          </article>
        </section>

        <section className="mx-auto mt-16 grid max-w-[1440px] gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div className="border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Deterministic fixture</p>
                <h2 className="mt-2 text-2xl font-bold uppercase">Fresh judge session</h2>
              </div>
              <Database className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              An isolated sandbox rebuilds one buyer mission, five policy-test e-bikes, one dedicated seller and one negotiation thread. No real account or contact data is used.
            </p>
            <div className="mt-5 border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Judge key</p>
              <div className="mt-2">
                <AgentKeyConnect compact />
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <JudgeResetButton {...judgeReset} />
            </div>
            {judgeReset.capability.authorized ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-subtle">Synthetic seller</p>
                <SellerTurnButton apiKey={apiKey} />
              </div>
            ) : null}
          </div>

          <div className="grid gap-6">
            <div className="border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Imperative API</p>
                  <h2 className="mt-2 text-2xl font-bold uppercase">Exact tool registry</h2>
                </div>
                <div className="inline-flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                  document.modelContext
                </div>
              </div>
              <div className="mt-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Registered now</p>
                <ul className="mt-2 flex flex-wrap gap-2" data-testid="webmcp-challenge-registered-tools">
                  {registeredToolNames.length ? (
                    registeredToolNames.map((name) => (
                      <li key={name} data-testid="webmcp-challenge-registered-tool" className="border border-success/40 bg-success/10 px-2.5 py-1 font-mono text-[11px] text-success">
                        {name}
                      </li>
                    ))
                  ) : (
                    <li className="border border-border px-2.5 py-1 font-mono text-[11px] text-subtle">None — WebMCP API not active in this browser.</li>
                  )}
                </ul>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Expected for this session</p>
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
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Copy this exact mission</p>
                <blockquote className="mt-3 max-w-5xl text-sm leading-relaxed text-text sm:text-base" data-testid="webmcp-challenge-prompt">
                  “{JUDGE_PROMPT}”
                </blockquote>
              </div>
              <button
                type="button"
                onClick={copyPrompt}
                className="inline-flex h-11 items-center justify-center gap-2 border border-primary px-4 font-mono text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-bg"
              >
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                Copy prompt
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
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Eligible work only</p>
              <h2 className="mt-2 text-3xl font-bold uppercase">Built after August 25</h2>
            </div>
            <EvidenceLink href={HACKATHON_DOC_URL} label="Full eligibility ledger" />
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted">
            Official contest samples cover catalogues and carts. ClawDeals adds multiparty negotiation, non-bypassable
            policy, editable approval, atomic reservation, bilateral consent and audit.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Contextual WebMCP", "Official registration lifecycle, scoped tools and shared human-agent UI."],
              ["02", "Deal Mission", "Hard budgets, policy_fit ranking and deterministic Paris e-bike candidates."],
              ["03", "Controlled negotiation", "Editable confirmation, owner approvals and atomic offer reservation."],
              ["04", "Trust receipts", "Bilateral contact consent, redacted hashes and durable action outcomes."]
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
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-subtle">Baseline</p>
              <p className="mt-1 break-all font-mono text-xs text-text">00880457964929c0773237a9c724704f5da651f0</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-subtle">Deployed build</p>
              <p className="mt-1 break-all font-mono text-xs text-text" data-testid="webmcp-challenge-deploy-sha">
                {deploySha ? deploySha.slice(0, 12) : "unavailable"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Evidence</p>
              <div className="mt-3 space-y-2">
                <EvidenceLink href={REPO_URL} label="Public repository" />
                <br />
                <EvidenceLink href={EVALS_URL} label="WebMCP evals" />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Strategy</p>
              <div className="mt-3">
                <EvidenceLink href={PLAN_URL} label="Victory plan" />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-subtle">Product path</p>
              <Link href="/webmcp" className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline">
                Open the real marketplace
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
