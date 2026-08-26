export const CHATGPT_SELECTION_STATUS = "unproven" as const;

export type ChatgptSelectionStatus = typeof CHATGPT_SELECTION_STATUS;

export type WebmcpEvalRole = "visitor" | "agent" | "owner";

export type WebmcpAuthContext = {
  hasAgentKey?: boolean;
  role?: WebmcpEvalRole;
};

export type WebmcpSelectionRefusal =
  | "cancellation"
  | "ambiguous"
  | "unauthorized_approval"
  | "tool_unavailable"
  | "no_match";

export type WebmcpSelectionInput = {
  prompt: string;
  route: string;
  auth?: WebmcpAuthContext;
  availableTools?: readonly string[];
};

export type WebmcpSelectionPlan = {
  firstTool: string | null;
  toolSequence: string[];
  refusal: WebmcpSelectionRefusal | null;
  intent: string;
  desiredFirstTool: string | null;
  contentAsData: boolean;
  chatgptSelection: ChatgptSelectionStatus;
  evidenceKind: "deterministic_reference_planner";
};

export type WebmcpSelectionCase = {
  id: string;
  prompt: string;
  route: string;
  auth?: WebmcpAuthContext;
  tags?: string[];
  expected: {
    firstTool: string | null;
    toolSequence?: string[];
    refusal?: WebmcpSelectionRefusal | null;
    contentAsData?: boolean;
    registryContains?: string[];
    registryAbsent?: string[];
  };
};

export type WebmcpEvalCaseResult = {
  id: string;
  ok: boolean;
  deterministic: boolean;
  firstTool: string | null;
  expectedFirstTool: string | null;
  availableTools: string[];
  plan: WebmcpSelectionPlan;
};

export type WebmcpEvalReport = {
  kind: "webmcp-reference-selection";
  chatgptSelection: ChatgptSelectionStatus;
  evidenceKind: "deterministic_reference_planner";
  repeats: number;
  caseCount: number;
  correctCount: number;
  firstToolAccuracy: number;
  passed: boolean;
  results: WebmcpEvalCaseResult[];
};
