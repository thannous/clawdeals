import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260713095350_evidence_upload_reservations_v1.sql"
);

describe("evidence reservation migration contract", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("serializes quota allocation on the stable evidence-pack row", () => {
    expect(sql).toContain("where evidence_pack_id = p_evidence_pack_id\n  for update");
    expect(sql).toContain("status in ('PENDING', 'VERIFYING', 'CLEANING')");
    expect(sql).toContain("v_remaining_bytes := 50 * 1024 * 1024");
  });

  it("enforces one evidence row per immutable storage object", () => {
    expect(sql).toContain("evidence_items_storage_object_unique_idx");
    expect(sql).toContain("on public.evidence_items (storage_bucket, storage_key)");
  });

  it("fails closed on historical duplicates without deleting evidence", () => {
    expect(sql).toContain("EVIDENCE_ITEMS_DUPLICATE_STORAGE_OBJECTS_REQUIRE_REVIEW");
    expect(sql).toContain("having count(*) > 1");
    expect(sql).not.toMatch(/delete\s+from\s+public\.evidence_items/i);
  });

  it("binds confirmation to the exact issuing actor and role", () => {
    expect(sql).toContain("v_reservation.issued_to_type <> p_issued_to_type");
    expect(sql).toContain("v_reservation.issued_to_id <> p_issued_to_id");
    expect(sql).toContain("v_reservation.submitted_by <> p_submitted_by");
  });

  it("keeps expired reservations quota-accounted until storage cleanup completes", () => {
    expect(sql).toContain("status in ('PENDING', 'VERIFYING', 'CLEANING')");
    expect(sql).toContain("status = 'VERIFYING'");
    expect(sql).toContain("updated_at <= now() - interval '15 minutes'");
    expect(sql).toContain("set status = 'CLEANING'");
    expect(sql).toContain("set status = 'EXPIRED'");
    expect(sql).toContain("and status = 'CLEANING'");
  });

  it("hardens the evidence bucket and restricts internal RPCs to service_role", () => {
    expect(sql).toContain("file_size_limit = 50 * 1024 * 1024");
    expect(sql).toContain("allowed_mime_types = array[");
    expect(sql).toContain("revoke all on function public.reserve_evidence_upload_v1");
    expect(sql).toContain("grant execute on function public.finalize_evidence_upload_v1");
  });
});
