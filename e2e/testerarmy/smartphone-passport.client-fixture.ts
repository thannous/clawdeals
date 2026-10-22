import { readFileSync } from "node:fs";
import type { Browser } from "@e2e-dev/web";

// Deliberate client fixture: owner APIs and Next page data are intercepted.
// This qualifies the browser contract, not server authorization or persistence.
export const passportListingId = "ab111111-1111-4111-8111-111111111111";
export const passportOwnerId = "ab222222-2222-4222-8222-222222222222";
export const passportPhotoId = "ab333333-3333-4333-8333-333333333333";
export const passportUploadPhotoId = "ab444444-4444-4444-8444-000000000001";
export const checkIds = ["battery", "screen", "functionality", "locks", "repairs_accessories"] as const;
type CheckId = typeof checkIds[number];
type Answer = "unknown" | "ok" | "issue" | "not_applicable";
type Photo = { photo_id: string; url: string; created_at: string };
type Check = { id: CheckId; answer: Answer; notes: string; status: "missing" | "declared" | "documented"; photos: Photo[] };
export type ClientPassport = {
  listing_id: string; revision: number; model: string; battery_health_percent: number | null;
  checks: Check[]; questions: { check_id: CheckId; reason: "answer_missing" | "photo_missing" | "battery_health_missing"; prompt: string }[]; updated_at: string;
};
type SaveBody = {
  expected_revision: number; model: string; battery_health_percent: number | null;
  checks: Record<CheckId, { answer: Answer; notes: string; photo_ids: string[] }>;
};
const stamp = "2026-10-22T12:00:00.000Z";
const messages = JSON.parse(readFileSync(new URL("../../messages/fr.json", import.meta.url), "utf8"));
const prompts: Record<CheckId, string> = {
  battery: "Pouvez-vous montrer l’état de santé de la batterie ?",
  screen: "L’écran et le châssis présentent-ils des défauts ?",
  functionality: "Face ID, les caméras et le microphone fonctionnent-ils ?",
  locks: "Les comptes et les verrouillages seront-ils retirés ?",
  repairs_accessories: "Quelles réparations ont été faites et quels accessoires sont inclus ?",
};
export function samplePassport(): ClientPassport {
  const photos = [{ photo_id: passportPhotoId, url: `/api/v1/owner/listings/${passportListingId}/passport/photos/${passportPhotoId}`, created_at: stamp }];
  return {
    listing_id: passportListingId, revision: 1, model: "iPhone 13", battery_health_percent: 89,
    checks: checkIds.map(id => ({ id, answer: id === "battery" || id === "screen" ? "ok" : "unknown",
      notes: id === "battery" ? "Capture des réglages du téléphone" : "",
      status: id === "battery" ? "documented" : id === "screen" ? "declared" : "missing",
      photos: id === "battery" ? photos : [] })),
    questions: checkIds.filter(id => id !== "battery").map(check_id => ({ check_id, reason: check_id === "screen" ? "photo_missing" : "answer_missing", prompt: prompts[check_id] })),
    updated_at: stamp,
  };
}

export async function installPassportClientFixture(browser: Browser, baseUrl: string, initial: ClientPassport | null = null) {
  const origin = new URL(baseUrl).origin;
  let current = initial;
  let nextFailure: { status: number; code: string; message: string } | null = null;
  let malformedSave = false;
  let failPhotoDelete = false;
  const operations: string[] = [];
  const deletes: string[] = [];
  const writes: SaveBody[] = [];
  const uploads: { check_id: CheckId; content_type: string; data_base64: string }[] = [];
  const listing = {
    listing_id: passportListingId, title: initial ? "iPhone 13 de test" : "Objet de test",
    description: "Annonce synthétique pour le passeport objet.", category: "electronics", condition: "GOOD", status: "LIVE",
    price_amount: 280, currency: "EUR", price: { amount: 280, currency: "EUR" },
    images: [], photos: [], seller: null, created_at: stamp,
  };
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: passportOwnerId } } }));
  await browser.route("**/api/v1/owner/agents*", route => route.fulfill({ json: { data: { agents: [] } } }));
  await browser.route("**/api/v1/owner/watchlists?*", route => route.fulfill({ json: { data: { watchlists: [], next_cursor: null } } }));
  await browser.route(`**/api/v1/owner/listings/${passportListingId}`, route => route.fulfill({ json: { data: listing } }));
  await browser.route(`**/api/v1/owner/listings/${passportListingId}/passport`, async route => {
    if (route.request.method === "PUT") {
      const body = JSON.parse(route.request.postData || "{}") as SaveBody;
      writes.push(body);
      operations.push("PUT");
      if (malformedSave) {
        malformedSave = false;
        return route.fulfill({ json: { data: { passport: { ...current, checks: [], updated_at: "invalid" } } } });
      }
      if (nextFailure) {
        const failure = nextFailure;
        nextFailure = null;
        return route.fulfill({ status: failure.status, json: { error: { code: failure.code, message: failure.message } } });
      }
      const checks: Check[] = checkIds.map(id => ({ id, answer: body.checks[id].answer, notes: body.checks[id].notes,
        status: body.checks[id].answer === "unknown" ? "missing" : body.checks[id].photo_ids.length ? "documented" : "declared",
        photos: body.checks[id].photo_ids.map(photo_id => ({ photo_id, url: `/api/v1/owner/listings/${passportListingId}/passport/photos/${photo_id}`, created_at: stamp })) }));
      current = { listing_id: passportListingId, revision: (current?.revision || 0) + 1,
        model: body.model, battery_health_percent: body.battery_health_percent, checks,
        questions: checks.filter(check => check.status !== "documented").map(check => ({ check_id: check.id, reason: check.status === "missing" ? "answer_missing" : "photo_missing", prompt: prompts[check.id] })),
        updated_at: stamp };
    }
    return route.fulfill({ json: { data: { passport: current } } });
  });
  await browser.route(`**/api/v1/owner/listings/${passportListingId}/passport/photos`, route => {
    uploads.push(JSON.parse(route.request.postData || "{}"));
    const photo_id = `ab444444-4444-4444-8444-${String(uploads.length).padStart(12, "0")}`;
    operations.push("POST photo");
    return route.fulfill({ status: 201, json: { data: { photo_id, url: `/api/v1/owner/listings/${passportListingId}/passport/photos/${photo_id}`, created_at: stamp } } });
  });
  await browser.route(`**/api/v1/public/listings/${passportListingId}/passport`, route => route.fulfill({ json: { data: {
    passport: current ? { ...current, checks: current.checks.map(check => ({ ...check, photos: check.photos.map(photo => ({ ...photo,
      url: `/api/v1/public/listings/${passportListingId}/passport/photos/${photo.photo_id}` })) })) } : null,
  } } }));
  await browser.route(new RegExp(`/api/v1/(?:owner|public)/listings/${passportListingId}/passport/photos/[0-9a-f-]+$`), route => {
    if (route.request.method === "DELETE") {
      const photo_id = new URL(route.request.url).pathname.split("/").at(-1)!;
      deletes.push(photo_id);
      operations.push(`DELETE ${photo_id}`);
      if (current?.checks.some(check => check.photos.some(photo => photo.photo_id === photo_id))) {
        return route.fulfill({ status: 409, json: { error: { code: "PASSPORT_PHOTO_IN_USE" } } });
      }
      if (failPhotoDelete) {
        failPhotoDelete = false;
        return route.fulfill({ status: 503, json: { error: { code: "STORAGE_UNAVAILABLE" } } });
      }
      return route.fulfill({ json: { data: { deleted: true } } });
    }
    return route.fulfill({ path: "public/favicon-192.png", contentType: "image/png" });
  });
  await browser.route("**/api/v1/public/listings?*", route => route.fulfill({ json: { data: [listing], next_cursor: null } }));
  await browser.route(new RegExp(`/\\_next/data/[^/]+/(?:fr/)?browse/${passportListingId}\\.json`), route => route.fulfill({
    json: { pageProps: { listing, locale: "fr", messages }, __N_SSP: true },
  }));
  await browser.addInitScript(`Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async (value) => { window.__passportCopiedQuestions = value; } }
  });`);
  return {
    listing, writes, uploads, deletes, operations,
    get passport() { return current; },
    failNextSave(failure: NonNullable<typeof nextFailure>) { nextFailure = failure; },
    returnMalformedSave() { malformedSave = true; },
    failNextPhotoDelete() { failPhotoDelete = true; },
  };
}
