import { z } from "zod";
import { errorPayload } from "./errors";
import { jsonResponse } from "./response";
import { requirePassportOwner } from "./smartphone-passport";
import { isUuid } from "../utils/validators";

export const projectMutationSchema = z.object({ expected_version: z.number().int().positive() }).strict();
export const projectSelectionSchema = projectMutationSchema.extend({ configuration_id: z.string().min(1).max(500) }).strict();
export const projectContactSchema = projectSelectionSchema.extend({ confirmed_preview: z.literal(true) }).strict();

export function requireProjectOwner(req: any, ctx: any, write = false) {
  const blocked = requirePassportOwner(req, ctx, write);
  if (blocked) return blocked;
  if (!write) return null;
  const expectedOwner = req.headers?.["x-expected-owner-id"];
  if (typeof expectedOwner !== "string" || !isUuid(expectedOwner) || !isUuid(req.headers?.["idempotency-key"])) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "X-Expected-Owner-Id and Idempotency-Key must be UUIDs"));
  }
  if (expectedOwner !== ctx.ownerId) return jsonResponse(403, errorPayload("OWNER_SESSION_CHANGED", "The signed-in owner changed before confirmation"));
  return null;
}

export function projectMissionId(req: any): string {
  const id = req.query?.mission_id;
  if (typeof id !== "string" || !isUuid(id)) throw Object.assign(new Error("Invalid mission_id"), { status: 400, code: "VALIDATION_ERROR" });
  return id;
}

export function projectMissionError(error: any) {
  if (error instanceof z.ZodError) return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Invalid project mission input", error.issues), { "Cache-Control": "private, no-store" });
  const status = error?.status || 500;
  return jsonResponse(status, errorPayload(error?.code || "PROJECT_MISSION_ERROR", status < 500 ? error.message : "Unable to access the project mission", error?.details), { "Cache-Control": "private, no-store" });
}
