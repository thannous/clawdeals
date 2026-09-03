import { RotateCcw } from "lucide-react";

import type { useJudgeReset } from "./useJudgeReset";

type JudgeResetProps = ReturnType<typeof useJudgeReset> & {
  testIdPrefix?: string;
  fullWidth?: boolean;
};

export default function JudgeResetButton({
  capability,
  resetState,
  resetResult,
  resetDemo,
  resetLabel,
  statusText,
  testIdPrefix = "webmcp-challenge",
  fullWidth = true
}: JudgeResetProps) {
  return (
    <>
      <button
        type="button"
        data-testid={`${testIdPrefix}-reset`}
        disabled={!capability.authorized || resetState === "running"}
        onClick={resetDemo}
        className={`inline-flex h-11 items-center justify-center gap-2 border border-primary px-4 font-mono text-xs font-bold uppercase tracking-widest text-primary transition enabled:hover:bg-primary enabled:hover:text-bg disabled:cursor-not-allowed disabled:border-border disabled:text-subtle ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <RotateCcw className={`h-4 w-4 ${resetState === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
        {resetLabel}
      </button>
      <div className="mt-3 min-h-10 font-mono text-[11px] leading-relaxed text-subtle" data-testid={`${testIdPrefix}-reset-status`}>
        {statusText}
        {resetState === "done" && resetResult?.counts ? (
          <span className="mt-2 block text-success" data-testid={`${testIdPrefix}-reset-result`}>
            Ready: {resetResult.counts.listings || 0} listings · {resetResult.counts.threads || 0} thread ·{" "}
            {resetResult.counts.messages || 0} message.
          </span>
        ) : null}
        {resetState === "failed" ? (
          <span className="mt-2 block text-error">Reset rejected. Verify the isolated host and judge key.</span>
        ) : null}
      </div>
    </>
  );
}
