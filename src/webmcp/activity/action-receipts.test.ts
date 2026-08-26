import { describe, expect, it } from "vitest";

import {
  ActionReceiptStore,
  createMemoryStorage,
  createPendingActionReceipt,
  extractApprovalIds,
  finalizeActionReceipt,
  redactAndHashInput,
  safeReceiptLink
} from "./action-receipts";

async function pending(overrides: Record<string, unknown> = {}) {
  return createPendingActionReceipt({
    requestId: String(overrides.requestId || "req-1"),
    toolName: String(overrides.toolName || "make_offer"),
    actor: "agent",
    args: overrides.args || { amount: 1290, api_key: "cd_live_secret" },
    policy: { decision: "server_enforced", limit: 1300 },
    confirmation: "pending",
    timestamp: "2026-08-26T10:00:00.000Z",
    link: "/webmcp"
  });
}

describe("action receipts", () => {
  it("hashes canonical redacted arguments deterministically", async () => {
    const first = await redactAndHashInput({ b: 2, a: 1, email: "owner@example.com" });
    const second = await redactAndHashInput({ email: "someone@else.test", a: 1, b: 2 });

    expect(first.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.argumentsSummary).toEqual({ a: 1, b: 2, email: "[REDACTED]" });
  });

  it("redacts secrets and free-text PII before persistence", async () => {
    const receipt = await createPendingActionReceipt({
      requestId: "req-redaction",
      toolName: "send_message",
      actor: "agent",
      args: {
        authorization: "Bearer secret",
        note: "Email owner@example.com, call +33 6 12 34 56 78, key cd_live_abcdef, ghp_abcdefghijklmnopqrstuvwxyz, or Bearer abc.def",
        callback: "/done?token=raw-secret"
      },
      policy: { decision: "server_enforced" },
      confirmation: "approved",
      link: "/webmcp?token=secret"
    });
    const encoded = JSON.stringify(receipt);

    expect(encoded).not.toContain("Bearer secret");
    expect(encoded).not.toContain("owner@example.com");
    expect(encoded).not.toContain("6 12 34 56 78");
    expect(encoded).not.toContain("cd_live_abcdef");
    expect(encoded).not.toContain("Bearer abc.def");
    expect(encoded).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(encoded).not.toContain("raw-secret");
    expect(receipt.link).toBeNull();
  });

  it("finalizes while preserving durable identity and correlation", async () => {
    const receipt = await pending();
    const finalized = finalizeActionReceipt(receipt, {
      outcome: "success",
      confirmation: "approved",
      approvalIds: ["approval-1"],
      result: { offer_id: "offer-1", status: "accepted" },
      timestamp: "2026-08-26T10:01:00.000Z"
    });

    expect(finalized.receipt_id).toBe(receipt.receipt_id);
    expect(finalized.request_id).toBe(receipt.request_id);
    expect(finalized.input_hash).toBe(receipt.input_hash);
    expect(Object.keys(finalized)).toEqual([
      "receipt_version",
      "receipt_id",
      "request_id",
      "tool",
      "actor",
      "arguments_summary",
      "input_hash",
      "policy",
      "confirmation",
      "approval_ids",
      "outcome",
      "best_effort_error",
      "result",
      "timestamp",
      "link"
    ]);
    expect(finalized).toMatchObject({
      outcome: "success",
      confirmation: "approved",
      approval_ids: ["approval-1"]
    });
  });

  it("keeps pending, success, denied, and unknown outcomes distinct", async () => {
    const receipt = await pending();
    expect(receipt.outcome).toBe("pending");
    expect(finalizeActionReceipt(receipt, { outcome: "success" }).outcome).toBe("success");
    expect(finalizeActionReceipt(receipt, { outcome: "denied" }).outcome).toBe("denied");
    expect(
      finalizeActionReceipt(receipt, {
        outcome: "unknown",
        result: { safe_to_retry: false, reconciliation_url: "/my/offers" }
      })
    ).toMatchObject({
      outcome: "unknown",
      result: { safe_to_retry: false, reconciliation_url: "/my/offers" }
    });
  });

  it("serializes, reloads, and replaces the pending receipt", async () => {
    const storage = createMemoryStorage();
    const firstStore = new ActionReceiptStore({ storage });
    const receipt = await pending();
    firstStore.upsert(receipt);
    firstStore.upsert(finalizeActionReceipt(receipt, { outcome: "denied", confirmation: "denied" }));

    const reloaded = new ActionReceiptStore({ storage });
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.getByRequestId("req-1")?.outcome).toBe("denied");
  });

  it("clears in-memory and persisted receipts for a fresh judge session", async () => {
    const storage = createMemoryStorage();
    const store = new ActionReceiptStore({ storage });
    store.upsert(await pending());

    expect(store.clear()).toBe(true);
    expect(store.list()).toEqual([]);
    expect(new ActionReceiptStore({ storage }).list()).toEqual([]);
  });

  it("ignores corrupt storage and exposes best-effort write failures in memory", async () => {
    const corrupt = {
      getItem: () => "{not-json",
      setItem: () => {
        throw new Error("quota");
      }
    };
    const store = new ActionReceiptStore({ storage: corrupt });
    const stored = store.upsert(await pending());

    expect(store.list()).toHaveLength(1);
    expect(stored.best_effort_error).toBe("receipt_storage_write_failed");
    expect(store.list()[0].best_effort_error).toBe("receipt_storage_write_failed");
  });

  it("bounds chronology size and reads by both identifiers", async () => {
    const store = new ActionReceiptStore({ storage: createMemoryStorage(), maxEntries: 2 });
    for (let index = 1; index <= 3; index += 1) {
      store.upsert(await pending({ requestId: `req-${index}` }));
    }

    expect(store.list().map((receipt) => receipt.request_id)).toEqual(["req-3", "req-2"]);
    expect(store.getByReceiptId("rcpt_req-2")?.request_id).toBe("req-2");
    expect(store.getByRequestId("req-1")).toBeNull();
  });

  it("extracts approval ids recursively and accepts only safe local links", () => {
    expect(extractApprovalIds({ data: { approval_id: "a-1", approval_ids: ["a-2", "a-1"] } })).toEqual([
      "a-1",
      "a-2"
    ]);
    expect(safeReceiptLink("/my/approvals/a-1")).toBe("/my/approvals/a-1");
    expect(safeReceiptLink("https://evil.test/path")).toBeNull();
    expect(safeReceiptLink("/\\evil.test/path")).toBeNull();
    expect(safeReceiptLink("/owners/owner@example.com")).toBeNull();
    expect(safeReceiptLink("/path?token=secret")).toBeNull();
  });
});
