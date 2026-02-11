import { describe, expect, it } from "vitest";

import { matchRouteGroup } from "./route-groups";

describe("route groups", () => {
  it("matches offers.actions for accept/decline/cancel", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/accept", sp)).toBe(
      "offers.actions"
    );
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/decline", sp)).toBe(
      "offers.actions"
    );
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/cancel", sp)).toBe(
      "offers.actions"
    );
  });

  it("still matches offers.write for other /v1/offers routes", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/offers/00000000-0000-4000-a000-000000000123/counter", sp)).toBe(
      "offers.write"
    );
    expect(matchRouteGroup("PATCH", "/api/v1/offers/00000000-0000-4000-a000-000000000123", sp)).toBe(
      "offers.write"
    );
  });

  it("matches ratings.create for transaction ratings endpoint", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/transactions/00000000-0000-4000-a000-000000000123/ratings", sp)).toBe(
      "ratings.create"
    );
  });

  it("matches PSP, escrow, dispute, and evidence route groups (TI-210/TI-211/TI-212/TI-214)", () => {
    const sp = new URLSearchParams();

    expect(matchRouteGroup("POST", "/api/v1/ops/psp/configure", sp)).toBe("ops.psp.write");
    expect(matchRouteGroup("GET", "/api/v1/ops/psp/status", sp)).toBe("ops.psp.read");

    expect(matchRouteGroup("POST", "/api/v1/sellers/psp:onboard", sp)).toBe("sellers.psp.write");
    expect(matchRouteGroup("GET", "/api/v1/sellers/psp:status", sp)).toBe("sellers.psp.read");

    expect(matchRouteGroup("POST", "/api/v1/psp/webhooks", sp)).toBe("psp.webhooks");

    expect(
      matchRouteGroup("POST", "/api/v1/transactions/00000000-0000-4000-a000-000000000123/escrow:create", sp)
    ).toBe("escrows.create");

    expect(matchRouteGroup("POST", "/api/v1/escrows/00000000-0000-4000-a000-000000000123/pay", sp)).toBe(
      "escrows.pay"
    );
    expect(matchRouteGroup("POST", "/api/v1/escrows/00000000-0000-4000-a000-000000000123/mark-delivered", sp)).toBe(
      "escrows.mark_delivered"
    );
    expect(matchRouteGroup("POST", "/api/v1/escrows/00000000-0000-4000-a000-000000000123/confirm-received", sp)).toBe(
      "escrows.confirm_received"
    );

    expect(matchRouteGroup("POST", "/api/v1/escrows/00000000-0000-4000-a000-000000000123/disputes", sp)).toBe(
      "disputes.open"
    );

    expect(matchRouteGroup("POST", "/api/v1/disputes/00000000-0000-4000-a000-000000000123/resolve", sp)).toBe(
      "disputes.resolve"
    );

    expect(matchRouteGroup("POST", "/api/v1/disputes/00000000-0000-4000-a000-000000000123/evidence", sp)).toBe(
      "evidence.write"
    );
    expect(
      matchRouteGroup("POST", "/api/v1/disputes/00000000-0000-4000-a000-000000000123/evidence:confirm", sp)
    ).toBe("evidence.write");
    expect(matchRouteGroup("GET", "/api/v1/disputes/00000000-0000-4000-a000-000000000123/evidence", sp)).toBe(
      "evidence.read"
    );
  });

  it("matches channels.telegram.webhook (TI-221)", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("POST", "/api/v1/channels/telegram/webhook", sp)).toBe("channels.telegram.webhook");
    expect(matchRouteGroup("POST", "/api/v1/channels/telegram/webhook/secret", sp)).toBe("channels.telegram.webhook");
  });

  it("matches chat staged commands (TI-298)", () => {
    const sp = new URLSearchParams();
    const id = "00000000-0000-4000-a000-000000000123";
    expect(matchRouteGroup("POST", "/api/v1/chat/commands:stage", sp)).toBe("chat.commands.stage");
    expect(matchRouteGroup("POST", `/api/v1/chat/commands/${id}:confirm`, sp)).toBe("chat.commands.confirm");
    expect(matchRouteGroup("POST", `/api/v1/chat/commands/${id}:cancel`, sp)).toBe("chat.commands.cancel");
    expect(matchRouteGroup("POST", `/api/v1/chat/commands/${id}:undo`, sp)).toBe("chat.commands.undo");
  });

  it("matches deals.update for PATCH /v1/deals/:deal_id", () => {
    const sp = new URLSearchParams();
    const id = "00000000-0000-4000-a000-000000000123";
    expect(matchRouteGroup("PATCH", `/api/v1/deals/${id}`, sp)).toBe("deals.update");
  });

  it("matches deals.delete for DELETE /v1/deals/:deal_id", () => {
    const sp = new URLSearchParams();
    const id = "00000000-0000-4000-a000-000000000123";
    expect(matchRouteGroup("DELETE", `/api/v1/deals/${id}`, sp)).toBe("deals.delete");
  });

  it("matches contact reveal + installation scopes upgrade route groups (TI-331/TI-332)", () => {
    const sp = new URLSearchParams();
    const id = "00000000-0000-4000-a000-000000000123";

    expect(matchRouteGroup("POST", `/api/v1/transactions/${id}/request-contact-reveal`, sp)).toBe("contact_reveal.request");
    expect(matchRouteGroup("POST", `/api/v1/installations/${id}:scopes-upgrade`, sp)).toBe("installations.scopes_upgrade");
    expect(matchRouteGroup("POST", `/api/console/installations/${id}:scopes-upgrade`, sp)).toBe("installations.scopes_upgrade");
    expect(matchRouteGroup("POST", `/api/console/installations/${id}:revoke`, sp)).toBe("installations.revoke");
  });

  it("matches threads.watch for POST /v1/threads/:thread_id:watch", () => {
    const sp = new URLSearchParams();
    const id = "00000000-0000-4000-a000-000000000123";
    expect(matchRouteGroup("POST", `/api/v1/threads/${id}:watch`, sp)).toBe("threads.watch");
  });
});
