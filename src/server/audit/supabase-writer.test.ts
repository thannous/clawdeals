import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { createSupabaseAuditWriter } from "./supabase-writer";

describe("createSupabaseAuditWriter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts audit rows into audit_logs by default", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    const writer = createSupabaseAuditWriter();
    await writer({ id: "a1" });

    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(insert).toHaveBeenCalledWith({ id: "a1" });
  });

  it("throws a helpful error when Supabase insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    const writer = createSupabaseAuditWriter({ table: "audit_logs_test" });

    await expect(writer({ id: "a1" })).rejects.toThrow("Failed to insert audit log: db down");
  });
});

