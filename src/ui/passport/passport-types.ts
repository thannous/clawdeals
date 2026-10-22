import { SMARTPHONE_CHECK_IDS, PASSPORT_MAX_NOTES_LENGTH, type SmartphonePassport as Passport, type SmartphonePassportPhoto as Photo } from "../../lib/smartphone-passport";
export { SMARTPHONE_CHECK_IDS as CHECK_IDS } from "../../lib/smartphone-passport";
export type { SmartphoneCheckId as CheckId, SmartphoneAnswer as Answer, SmartphonePassportPhoto as PassportPhoto, SmartphonePassportCheck as PassportCheck, SmartphonePassport as Passport } from "../../lib/smartphone-passport";

type ResponseContext = { listingId: string; access: "owner" | "public"; expectedRevision?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANSWERS = ["unknown", "ok", "issue", "not_applicable"];
const STATUSES = ["missing", "declared", "documented"];
const REASONS = ["answer_missing", "photo_missing", "battery_health_missing"];
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function invalid(): never {
  throw new Error("Invalid passport response");
}
function validPhoto(value: unknown, context: ResponseContext): value is Photo {
  if (!record(value) || typeof value.photo_id !== "string" || !UUID.test(value.photo_id) || !validDate(value.created_at)) return false;
  return value.url === `/api/v1/${context.access}/listings/${context.listingId}/passport/photos/${value.photo_id}`;
}

export function photoFromResponse(value: unknown, context: ResponseContext): Photo {
  if (!record(value) || !validPhoto(value.data, context)) invalid();
  return value.data;
}

export function passportFromResponse(value: unknown, context: ResponseContext): Passport | null {
  if (!record(value) || !record(value.data) || !("passport" in value.data)) invalid();
  const passport = value.data.passport;
  if (passport === null && context.expectedRevision === undefined) return null;
  if (!record(passport)) invalid();
  if (passport.listing_id !== context.listingId || !UUID.test(context.listingId)) invalid();
  if (typeof passport.model !== "string" || !passport.model.trim() || passport.model.length > 120) invalid();
  if (typeof passport.revision !== "number" || !Number.isSafeInteger(passport.revision) || passport.revision < 1) invalid();
  if (context.expectedRevision !== undefined && passport.revision !== context.expectedRevision + 1) invalid();
  const health = passport.battery_health_percent;
  if (health !== null && (typeof health !== "number" || !Number.isInteger(health) || health < 0 || health > 100)) invalid();
  if (!validDate(passport.updated_at) || !Array.isArray(passport.checks) || passport.checks.length !== SMARTPHONE_CHECK_IDS.length || !Array.isArray(passport.questions)) invalid();
  const checkIds = new Set<string>();
  const photoIds = new Set<string>();
  for (const check of passport.checks) {
    if (!record(check) || typeof check.id !== "string" || !(SMARTPHONE_CHECK_IDS as readonly string[]).includes(check.id) || checkIds.has(check.id)) invalid();
    checkIds.add(check.id);
    if (typeof check.answer !== "string" || !ANSWERS.includes(check.answer) || typeof check.status !== "string" || !STATUSES.includes(check.status)) invalid();
    if (typeof check.notes !== "string" || check.notes.length > PASSPORT_MAX_NOTES_LENGTH || !Array.isArray(check.photos) || check.photos.length > 2) invalid();
    if (check.answer === "not_applicable" && (check.id !== "battery" || !check.notes.trim() || health !== null)) invalid();
    if (check.status !== (check.answer === "unknown" ? "missing" : check.photos.length ? "documented" : "declared")) invalid();
    for (const photo of check.photos) {
      if (!validPhoto(photo, context) || photoIds.has(photo.photo_id)) invalid();
      photoIds.add(photo.photo_id);
    }
  }
  const questionIds = new Set<string>();
  for (const question of passport.questions) {
    if (!record(question) || typeof question.check_id !== "string" || !checkIds.has(question.check_id) || typeof question.reason !== "string" || !REASONS.includes(question.reason) || typeof question.prompt !== "string") invalid();
    const questionId = `${question.check_id}:${question.reason}`;
    if (questionIds.has(questionId) || (question.reason === "battery_health_missing" && question.check_id !== "battery")) invalid();
    questionIds.add(questionId);
  }
  return passport as Passport;
}
