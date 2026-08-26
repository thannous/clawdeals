export const CHATGPT_SELECTION_STATUS = "unproven";
export const EVIDENCE_KIND = "deterministic_reference_planner";
export const MIN_FIRST_TOOL_ACCURACY = 0.9;
export const DEFAULT_REPEATS = 3;

const TOOL_ORDER = [
  "get_page_context",
  "show_listings",
  "open_listing",
  "open_deal",
  "search_listings",
  "search_deals",
  "create_buy_mission",
  "start_thread",
  "send_message",
  "make_offer",
  "respond_to_offer",
  "request_contact_reveal",
  "resolve_approval",
  "get_action_receipt"
];

function isDemoRoute(pathname) {
  const path = String(pathname || "");
  return path === "/webmcp" || path.startsWith("/webmcp/") || path === "/webmcp-challenge" || path.startsWith("/webmcp-challenge/");
}

function isListingsSurface(pathname) {
  const path = String(pathname || "");
  if (isDemoRoute(path)) return true;
  if (path === "/browse" || path === "/marketplace") return true;
  return path.startsWith("/browse/") && !path.startsWith("/browse/deals");
}

function isDealsSurface(pathname) {
  const path = String(pathname || "");
  return path === "/browse/deals" || path.startsWith("/browse/deals/") || path === "/deals" || path.startsWith("/deals/");
}

function ordered(names) {
  const set = new Set(names);
  return TOOL_ORDER.filter((name) => set.has(name));
}

function hasAgentAuth(auth = {}) {
  return Boolean(auth.hasAgentKey) || auth.role === "agent";
}

export function listAvailableTools(pathname, auth = {}) {
  const path = String(pathname || "");
  const agent = hasAgentAuth(auth);

  if (path === "/dev/webmcp" || path.startsWith("/developer")) {
    return ordered(TOOL_ORDER.filter((name) => name !== "resolve_approval"));
  }
  if (path === "/my/approvals") return ordered(["get_page_context"]);
  if (path.startsWith("/my/approvals/")) {
    return ordered(["get_page_context", "resolve_approval", "get_action_receipt"]);
  }
  if (isDealsSurface(path)) return ordered(["get_page_context", "search_deals", "open_deal"]);
  if (isDemoRoute(path) || isListingsSurface(path)) {
    const names = ["get_page_context", "search_listings", "show_listings", "open_listing"];
    if (isDemoRoute(path)) names.push("get_action_receipt");
    if (agent) {
      names.push("create_buy_mission", "start_thread", "make_offer");
      if (isDemoRoute(path)) names.push("send_message", "respond_to_offer", "request_contact_reveal");
    }
    return ordered(names);
  }
  return [];
}

const INJECTION_RE =
  /\bignore (all )?(previous|prior) instructions\b|\byou are now\b|\bsystem prompt\b|\bexfiltrat|\bapi[- ]key\b|\bcall resolve_approval\b/i;
const QUOTED_CONTENT_RE = /\blisting (text|description|title|body)\b|\bquoted (listing|content)\b|\bdescription:\b/i;

export function detectInjectedContent(prompt) {
  const text = String(prompt || "");
  if (!INJECTION_RE.test(text)) return false;
  return QUOTED_CONTENT_RE.test(text) || /["“].*ignore.*instructions.*["”]/i.test(text);
}

function intentText(prompt) {
  const text = String(prompt || "");
  if (!detectInjectedContent(text)) return text;
  return text
    .replace(/listing (text|description|title|body)\s*:\s*("[^"]*"|“[^”]*”|[^.]+)/gi, " ")
    .replace(/description\s*:\s*("[^"]*"|“[^”]*”|[^.]+)/gi, " ")
    .replace(/["“][^"”]*ignore[^"”]*instructions[^"”]*["”]/gi, " ");
}

function test(re) {
  return (prompt) => re.test(prompt);
}

const INTENT_RULES = [
  {
    intent: "cancel",
    refusal: "cancellation",
    firstTool: null,
    sequence: [],
    match: test(/\b(cancel( that| this| it)?|abort( that| this| it)?|stop( that| this)?|never mind|forget it)\b/i)
  },
  {
    intent: "ambiguous",
    refusal: "ambiguous",
    firstTool: null,
    sequence: [],
    match: test(/\b(maybe do something|not sure what to do|i don['’]t know what to (do|pick)|whatever you think|do something about)\b/i)
  },
  {
    intent: "owner_approval",
    firstTool: "resolve_approval",
    sequence: ["resolve_approval"],
    match: test(/\b(approve|deny|revoke)\b/i)
  },
  {
    intent: "contact_consent",
    firstTool: "request_contact_reveal",
    sequence: ["request_contact_reveal"],
    match: test(/\b(request contact|exchange contact|contact (details|info|reveal)|bilateral consent|reveal (my )?contact)\b/i)
  },
  {
    intent: "create_mission",
    firstTool: "create_buy_mission",
    sequence: ["create_buy_mission"],
    match: (prompt) =>
      /\b(monitor|keep watching|watch this search|create (a )?((buy|buying) )?mission|buy mission)\b/i.test(prompt) &&
      !/\bthen (find|search)\b/i.test(prompt)
  },
  {
    intent: "mission_then_search",
    firstTool: "create_buy_mission",
    sequence: ["create_buy_mission", "search_listings"],
    match: test(/\b(create (a )?mission then (find|search)|monitor.{0,40}then (find|search))\b/i)
  },
  {
    intent: "respond_offer",
    firstTool: "respond_to_offer",
    sequence: ["respond_to_offer"],
    match: test(/\b((accept|decline|counter) (the )?(open )?offer|counter[- ]offer)\b/i)
  },
  {
    intent: "make_offer",
    firstTool: "make_offer",
    sequence: ["make_offer"],
    match: test(/\b(make (an? )?offer|offer (€|£|\$)?\s?\d)/i)
  },
  {
    intent: "ask_then_message",
    firstTool: "start_thread",
    sequence: ["start_thread", "send_message"],
    match: test(/\b(ask (about|the seller|whether)|question about|ask the seller)\b/i)
  },
  {
    intent: "send_message",
    firstTool: "send_message",
    sequence: ["send_message"],
    match: test(/\b(send (a )?(follow-up )?(question|message)|existing thread)\b/i)
  },
  {
    intent: "search_deals",
    firstTool: "search_deals",
    sequence: ["search_deals"],
    match: test(/\b(search deals|find deals|deal feed|deals about)\b/i)
  },
  {
    intent: "open_deal",
    firstTool: "open_deal",
    sequence: ["open_deal"],
    match: test(/\bopen (this |the |that )?deal\b/i)
  },
  {
    intent: "open_listing",
    firstTool: "open_listing",
    sequence: ["open_listing"],
    match: test(/\bopen (this |the |that |a )?listing\b/i)
  },
  {
    intent: "search_then_open",
    firstTool: "search_listings",
    sequence: ["search_listings", "open_listing"],
    match: test(/\b(find|search).{0,60}\bthen open\b/i)
  },
  {
    intent: "show_listings",
    firstTool: "show_listings",
    sequence: ["show_listings"],
    match: test(/\b(show|highlight) (me )?(these |the )?listings?\b/i)
  },
  {
    intent: "action_receipt",
    firstTool: "get_action_receipt",
    sequence: ["get_action_receipt"],
    match: test(/\b(action )?receipt\b/i)
  },
  {
    intent: "page_context",
    firstTool: "get_page_context",
    sequence: ["get_page_context"],
    match: test(/\b(what page|page context|where am i|current page)\b/i)
  },
  {
    intent: "search_listings",
    firstTool: "search_listings",
    sequence: ["search_listings"],
    match: test(/\b(find|search|look for|used e-bike|listings?)\b/i)
  }
];

function matchIntent(prompt) {
  const text = intentText(prompt);
  for (const rule of INTENT_RULES) {
    if (rule.match(text)) {
      return {
        intent: rule.intent,
        desiredFirstTool: rule.firstTool ?? null,
        sequence: rule.sequence || [],
        refusal: rule.refusal || null
      };
    }
  }
  return {
    intent: "no_match",
    desiredFirstTool: null,
    sequence: [],
    refusal: "no_match"
  };
}

function emptyPlan(partial) {
  return {
    firstTool: null,
    toolSequence: [],
    refusal: null,
    intent: "no_match",
    desiredFirstTool: null,
    contentAsData: false,
    chatgptSelection: CHATGPT_SELECTION_STATUS,
    evidenceKind: EVIDENCE_KIND,
    ...partial
  };
}

export function planSelection(input) {
  const prompt = String(input?.prompt || "");
  const route = String(input?.route || "");
  const auth = input?.auth || {};
  const availableTools = Array.isArray(input?.availableTools)
    ? [...input.availableTools]
    : listAvailableTools(route, auth);
  const toolSet = new Set(availableTools);
  const contentAsData = detectInjectedContent(prompt);
  const matched = matchIntent(prompt);

  if (matched.refusal === "cancellation" || matched.refusal === "ambiguous" || matched.refusal === "no_match") {
    return emptyPlan({
      refusal: matched.refusal,
      intent: matched.intent,
      desiredFirstTool: matched.desiredFirstTool,
      contentAsData
    });
  }

  if (matched.desiredFirstTool === "resolve_approval") {
    const ownerSession = toolSet.has("resolve_approval") && auth.role !== "agent" && auth.role !== "visitor";
    if (!ownerSession) {
      return emptyPlan({
        refusal: "unauthorized_approval",
        intent: matched.intent,
        desiredFirstTool: "resolve_approval",
        contentAsData
      });
    }
    return emptyPlan({
      firstTool: "resolve_approval",
      toolSequence: ["resolve_approval"],
      intent: matched.intent,
      desiredFirstTool: "resolve_approval",
      contentAsData
    });
  }

  if (!matched.desiredFirstTool || !toolSet.has(matched.desiredFirstTool)) {
    return emptyPlan({
      refusal: matched.desiredFirstTool ? "tool_unavailable" : "no_match",
      intent: matched.intent,
      desiredFirstTool: matched.desiredFirstTool,
      contentAsData
    });
  }

  const toolSequence = (matched.sequence.length ? matched.sequence : [matched.desiredFirstTool]).filter((name) =>
    toolSet.has(name)
  );

  return emptyPlan({
    firstTool: matched.desiredFirstTool,
    toolSequence,
    intent: matched.intent,
    desiredFirstTool: matched.desiredFirstTool,
    contentAsData
  });
}

function samePlan(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectedFirstTool(selectionCase) {
  return Object.prototype.hasOwnProperty.call(selectionCase.expected || {}, "firstTool")
    ? selectionCase.expected.firstTool
    : null;
}

export function scoreCase(selectionCase, plan, availableTools) {
  const expected = selectionCase.expected || {};
  const firstOk = plan.firstTool === expectedFirstTool(selectionCase);
  const sequenceOk = !expected.toolSequence || JSON.stringify(plan.toolSequence) === JSON.stringify(expected.toolSequence);
  const refusalOk = !Object.prototype.hasOwnProperty.call(expected, "refusal") || plan.refusal === (expected.refusal ?? null);
  const contentOk = expected.contentAsData === undefined || plan.contentAsData === Boolean(expected.contentAsData);
  const containsOk = (expected.registryContains || []).every((name) => availableTools.includes(name));
  const absentOk = (expected.registryAbsent || []).every((name) => !availableTools.includes(name));
  return firstOk && sequenceOk && refusalOk && contentOk && containsOk && absentOk;
}

export function evaluateSelectionCases(cases, options = {}) {
  const repeats = Number.isInteger(options.repeats) && options.repeats > 0 ? options.repeats : DEFAULT_REPEATS;
  const listTools = options.listTools || listAvailableTools;
  const results = [];
  let correctCount = 0;

  for (const selectionCase of cases) {
    const availableTools = listTools(selectionCase.route, selectionCase.auth || {});
    const plans = [];
    for (let index = 0; index < repeats; index += 1) {
      plans.push(
        planSelection({
          prompt: selectionCase.prompt,
          route: selectionCase.route,
          auth: selectionCase.auth,
          availableTools
        })
      );
    }
    const plan = plans[0];
    const deterministic = plans.every((item) => samePlan(item, plan));
    const ok = deterministic && scoreCase(selectionCase, plan, availableTools);
    if (ok) correctCount += 1;
    results.push({
      id: selectionCase.id,
      ok,
      deterministic,
      firstTool: plan.firstTool,
      expectedFirstTool: expectedFirstTool(selectionCase),
      availableTools,
      plan
    });
  }

  const firstToolCorrect = results.filter((result) => result.firstTool === result.expectedFirstTool).length;
  const firstToolAccuracy = cases.length === 0 ? 0 : firstToolCorrect / cases.length;

  return {
    kind: "webmcp-reference-selection",
    chatgptSelection: CHATGPT_SELECTION_STATUS,
    evidenceKind: EVIDENCE_KIND,
    repeats,
    caseCount: cases.length,
    correctCount,
    firstToolAccuracy,
    passed: firstToolAccuracy >= MIN_FIRST_TOOL_ACCURACY && results.every((result) => result.deterministic),
    results
  };
}
