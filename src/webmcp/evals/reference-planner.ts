import {
  CHATGPT_SELECTION_STATUS,
  DEFAULT_REPEATS,
  EVIDENCE_KIND,
  MIN_FIRST_TOOL_ACCURACY,
  detectInjectedContent,
  evaluateSelectionCases as evaluateSelectionCasesJs,
  listAvailableTools as listAvailableToolsJs,
  planSelection as planSelectionJs
} from "./reference-selection.mjs";
import type {
  WebmcpAuthContext,
  WebmcpEvalReport,
  WebmcpSelectionCase,
  WebmcpSelectionInput,
  WebmcpSelectionPlan
} from "./types";

export {
  CHATGPT_SELECTION_STATUS,
  DEFAULT_REPEATS,
  EVIDENCE_KIND,
  MIN_FIRST_TOOL_ACCURACY
};

export function listAvailableTools(pathname: string, auth: WebmcpAuthContext = {}): string[] {
  return listAvailableToolsJs(pathname, auth);
}

export function planSelection(input: WebmcpSelectionInput): WebmcpSelectionPlan {
  return planSelectionJs(input);
}

export function hasInjectedMarketplaceContent(prompt: string): boolean {
  return detectInjectedContent(prompt);
}

export function evaluateSelectionCases(
  cases: readonly WebmcpSelectionCase[],
  options: { repeats?: number; listTools?: (pathname: string, auth?: WebmcpAuthContext) => string[] } = {}
): WebmcpEvalReport {
  return evaluateSelectionCasesJs(cases, options) as WebmcpEvalReport;
}
