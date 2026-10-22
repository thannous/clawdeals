/** Seller-provided information: photos document a claim; they never certify it. */
export const SMARTPHONE_CHECK_IDS = ["battery", "screen", "functionality", "locks", "repairs_accessories"] as const;
export type SmartphoneCheckId = typeof SMARTPHONE_CHECK_IDS[number];
export type SmartphoneAnswer = "unknown" | "ok" | "issue" | "not_applicable";
export type SmartphoneCheckInput = { answer: SmartphoneAnswer; notes: string; photo_ids: string[] };
export type SmartphonePassportInput = {
  expected_revision: number;
  model: string;
  battery_health_percent: number | null;
  checks: Record<SmartphoneCheckId, SmartphoneCheckInput>;
};
export type SmartphonePassportPhoto = { photo_id: string; url: string; created_at: string };
export type SmartphonePassportCheck = {
  id: SmartphoneCheckId;
  answer: SmartphoneAnswer;
  notes: string;
  status: "missing" | "declared" | "documented";
  photos: SmartphonePassportPhoto[];
};
export type SmartphonePassportQuestion = {
  check_id: SmartphoneCheckId;
  reason: "answer_missing" | "photo_missing" | "battery_health_missing";
  prompt: string;
};
export type SmartphonePassport = {
  listing_id: string;
  revision: number;
  model: string;
  battery_health_percent: number | null;
  checks: SmartphonePassportCheck[];
  questions: SmartphonePassportQuestion[];
  updated_at: string;
};
export const PASSPORT_MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PASSPORT_MAX_NOTES_LENGTH = 800;

export function emptySmartphonePassportInput(): SmartphonePassportInput {
  return {
    expected_revision: 0,
    model: "",
    battery_health_percent: null,
    checks: Object.fromEntries(SMARTPHONE_CHECK_IDS.map((id) => [id, { answer: "unknown", notes: "", photo_ids: [] }])) as SmartphonePassportInput["checks"]
  };
}

/** Only an empty-state hint. An explicit smartphone choice is authoritative. */
export function isSmartphoneListing(category?: unknown, title?: unknown): boolean {
  const text = `${typeof category === "string" ? category : ""} ${typeof title === "string" ? title : ""}`;
  return /smartphone|iphone|pixel\s*\d|galaxy\s*[asz]\d|téléphone|telefono|mobile phone/i.test(text);
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400, code: "VALIDATION_ERROR" });
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string) {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid(`Unknown ${name} field`);
}

export function parseSmartphonePassportInput(value: unknown): SmartphonePassportInput {
  if (!record(value)) invalid("Passport must be an object");
  exactKeys(value, ["expected_revision", "model", "battery_health_percent", "checks"], "passport");
  if (!Number.isSafeInteger(value.expected_revision) || Number(value.expected_revision) < 0 || Number(value.expected_revision) >= 2147483647) invalid("Invalid expected_revision");
  if (typeof value.model !== "string" || !value.model.trim() || value.model.trim().length > 120) invalid("Model must contain 1 to 120 characters");
  const health = value.battery_health_percent;
  if (health !== null && (!Number.isInteger(health) || Number(health) < 0 || Number(health) > 100)) invalid("Battery health must be null or an integer from 0 to 100");
  if (!record(value.checks)) invalid("Five smartphone checks are required");
  exactKeys(value.checks, SMARTPHONE_CHECK_IDS, "check");
  const checks = {} as SmartphonePassportInput["checks"];
  const allPhotos = new Set<string>();
  for (const id of SMARTPHONE_CHECK_IDS) {
    const check = value.checks[id];
    if (!record(check)) invalid(`Missing ${id} check`);
    exactKeys(check, ["answer", "notes", "photo_ids"], "check");
    if (typeof check.answer !== "string" || !["unknown", "ok", "issue", "not_applicable"].includes(check.answer)) invalid(`Invalid ${id} answer`);
    if (typeof check.notes !== "string" || check.notes.trim().length > PASSPORT_MAX_NOTES_LENGTH) invalid(`Invalid ${id} notes`);
    if (check.answer === "issue" && !check.notes.trim()) invalid(`Describe the ${id} issue`);
    if (check.answer === "not_applicable" && (id !== "battery" || !check.notes.trim())) invalid("Only battery health may be unavailable; explain why");
    if (!Array.isArray(check.photo_ids) || check.photo_ids.length > 2) invalid("At most two photos per check");
    for (const photo of check.photo_ids) {
      if (typeof photo !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(photo) || allPhotos.has(photo.toLowerCase())) invalid("Invalid or duplicate photo_id");
      allPhotos.add(photo.toLowerCase());
    }
    checks[id] = { answer: check.answer as SmartphoneAnswer, notes: check.notes.trim(), photo_ids: (check.photo_ids as string[]).map((photo) => photo.toLowerCase()) };
  }
  if (checks.battery.answer === "not_applicable" && health !== null) invalid("Unavailable battery health must be null");
  return { expected_revision: Number(value.expected_revision), model: value.model.trim(), battery_health_percent: health as number | null, checks };
}

const PROMPTS: Record<SmartphoneCheckId, string> = {
  battery: "What is the battery health and how was it measured?",
  screen: "Are the screen and touch controls intact? Describe scratches, cracks or dead pixels.",
  functionality: "Have the cameras, audio, charging and connectivity been tested? Describe any failure.",
  locks: "Is the phone free of account and network locks, and what is its provenance? Do not share personal documents or identifiers.",
  repairs_accessories: "Which repairs were performed and which accessories are included?"
};

export function smartphonePassportQuestions(checks: SmartphonePassportCheck[], health: number | null): SmartphonePassportQuestion[] {
  const questions: SmartphonePassportQuestion[] = [];
  for (const check of checks) {
    if (check.answer === "unknown") {
      questions.push({ check_id: check.id, reason: "answer_missing", prompt: PROMPTS[check.id] });
      continue;
    }
    if (check.id === "battery" && health === null && check.answer !== "not_applicable") {
      questions.push({ check_id: check.id, reason: "battery_health_missing", prompt: PROMPTS.battery });
    }
    if (!check.photos.length) questions.push({ check_id: check.id, reason: "photo_missing", prompt: `Can you add a photo supporting this claim? ${PROMPTS[check.id]}` });
  }
  return questions;
}
