import type {
  WebmcpAuthContext,
  WebmcpEvalReport,
  WebmcpSelectionCase,
  WebmcpSelectionInput,
  WebmcpSelectionPlan
} from "./types";

export const CHATGPT_SELECTION_STATUS: "unproven";
export const EVIDENCE_KIND: "deterministic_reference_planner";
export const MIN_FIRST_TOOL_ACCURACY: 0.9;
export const DEFAULT_REPEATS: 3;

export function listAvailableTools(pathname: string, auth?: WebmcpAuthContext): string[];
export function detectInjectedContent(prompt: string): boolean;
export function planSelection(input: WebmcpSelectionInput): WebmcpSelectionPlan;
export function scoreCase(
  selectionCase: WebmcpSelectionCase,
  plan: WebmcpSelectionPlan,
  availableTools: readonly string[]
): boolean;
export function evaluateSelectionCases(
  cases: readonly WebmcpSelectionCase[],
  options?: {
    repeats?: number;
    listTools?: (pathname: string, auth?: WebmcpAuthContext) => string[];
  }
): WebmcpEvalReport;
