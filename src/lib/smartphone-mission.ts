import { SMARTPHONE_CHECK_IDS, type SmartphoneAnswer, type SmartphoneCheckId } from "./smartphone-passport";

export type SmartphoneMissionCriteria = {
  version: 1;
  model: string | null;
  battery_health_min: number | null;
  required_checks: SmartphoneCheckId[];
};
export type SmartphoneMissionPassport = {
  model: string;
  battery_health_percent: number | null;
  checks: Array<{ id: SmartphoneCheckId; answer: SmartphoneAnswer }>;
};
export type SmartphoneMissionReasonCode =
  | "passport_missing"
  | "model_matches" | "model_mismatch" | "model_unknown"
  | "battery_meets_minimum" | "battery_below_minimum" | "battery_unknown"
  | "check_ok" | "check_issue" | "check_unknown";
export type SmartphoneMissionReason = {
  code: SmartphoneMissionReasonCode;
  check_id?: SmartphoneCheckId;
  expected?: string | number;
  actual?: string | number;
};
export type SmartphoneMissionEvaluation = {
  status: "compatible" | "incompatible" | "unknown";
  reasons: SmartphoneMissionReason[];
};

function invalid(): never {
  throw new Error("criteria.mission.smartphone must have version 1 and at least one valid model, battery or check requirement");
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizedModel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

/** Reject unsupported fields instead of silently creating a weaker mission. */
export function normalizeSmartphoneMissionCriteria(raw: unknown): SmartphoneMissionCriteria {
  if (!record(raw) || raw.version !== 1 || Object.keys(raw).some(key =>
    !["version", "model", "battery_health_min", "required_checks"].includes(key))) invalid();
  let model: string | null = null;
  if (raw.model !== undefined && raw.model !== null) {
    if (typeof raw.model !== "string" || /[\u0000-\u001f\u007f]/u.test(raw.model)) invalid();
    model = raw.model.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!model || model.length > 120) invalid();
  }
  const minimum = raw.battery_health_min ?? null;
  if (minimum !== null && (typeof minimum !== "number" || !Number.isInteger(minimum) || minimum < 0 || minimum > 100)) invalid();
  const checks = raw.required_checks ?? [];
  if (!Array.isArray(checks) || checks.length > SMARTPHONE_CHECK_IDS.length ||
    checks.some(id => !SMARTPHONE_CHECK_IDS.includes(id)) || new Set(checks).size !== checks.length) invalid();
  if (!model && minimum === null && checks.length === 0) invalid();
  return {
    version: 1, model, battery_health_min: minimum as number | null,
    required_checks: SMARTPHONE_CHECK_IDS.filter(id => checks.includes(id))
  };
}

/** Only evaluates seller statements. Photos never imply a certification or match. */
export function evaluateSmartphoneMission(
  criteria: SmartphoneMissionCriteria,
  passport: SmartphoneMissionPassport | null
): SmartphoneMissionEvaluation {
  if (!passport) return { status: "unknown", reasons: [{ code: "passport_missing" }] };
  const reasons: SmartphoneMissionReason[] = [];
  let incompatible = false;
  let unknown = false;
  const checks = Array.isArray(passport.checks) ? passport.checks : [];
  // Duplicate/missing answers are unknown, never resolved by picking a convenient one.
  const checkAnswer = (id: SmartphoneCheckId) => {
    const values = checks.filter(check => check?.id === id);
    return values.length === 1 ? values[0].answer : "unknown";
  };
  if (criteria.model !== null) {
    const actual = typeof passport.model === "string" ? passport.model.trim() : "";
    if (!actual) {
      unknown = true;
      reasons.push({ code: "model_unknown", expected: criteria.model });
    } else if (normalizedModel(actual) !== normalizedModel(criteria.model)) {
      incompatible = true;
      reasons.push({ code: "model_mismatch", expected: criteria.model, actual });
    } else reasons.push({ code: "model_matches", expected: criteria.model, actual });
  }
  if (criteria.battery_health_min !== null) {
    const health = passport.battery_health_percent;
    const answer = checkAnswer("battery");
    if ((answer !== "ok" && answer !== "issue") || typeof health !== "number" ||
      !Number.isInteger(health) || health < 0 || health > 100) {
      unknown = true;
      reasons.push({ code: "battery_unknown", expected: criteria.battery_health_min });
    } else if (health < criteria.battery_health_min) {
      incompatible = true;
      reasons.push({ code: "battery_below_minimum", expected: criteria.battery_health_min, actual: health });
    } else reasons.push({ code: "battery_meets_minimum", expected: criteria.battery_health_min, actual: health });
  }
  for (const id of criteria.required_checks) {
    const answer = checkAnswer(id);
    if (answer === "ok") reasons.push({ code: "check_ok", check_id: id, expected: "ok", actual: "ok" });
    else if (answer === "issue") {
      incompatible = true;
      reasons.push({ code: "check_issue", check_id: id, expected: "ok", actual: "issue" });
    } else {
      unknown = true;
      reasons.push({ code: "check_unknown", check_id: id, expected: "ok" });
    }
  }
  return { status: incompatible ? "incompatible" : unknown ? "unknown" : "compatible", reasons };
}
