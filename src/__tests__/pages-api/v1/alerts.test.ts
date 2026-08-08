import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/services/email-alerts", () => ({
  createEmailAlert: vi.fn(),
  confirmEmailAlert: vi.fn()
}));

import { handler as createHandler } from "../../../pages/api/v1/alerts/index";
import { handler as confirmHandler } from "../../../pages/api/v1/alerts/confirm";
import { confirmEmailAlert, createEmailAlert } from "../../../server/services/email-alerts";

const createEmailAlertMock = vi.mocked(createEmailAlert);
const confirmEmailAlertMock = vi.mocked(confirmEmailAlert);

describe("POST /v1/alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing or malformed email", async () => {
    const missing: any = await createHandler({ method: "POST", headers: {}, body: { criteria: { query: "gpu" } } }, null, {});
    expect(missing.status).toBe(400);

    const malformed: any = await createHandler(
      { method: "POST", headers: {}, body: { email: "nope", criteria: { query: "gpu" } } },
      null,
      {}
    );
    expect(malformed.status).toBe(400);
    expect(createEmailAlertMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown market code", async () => {
    const result: any = await createHandler(
      { method: "POST", headers: {}, body: { email: "user@example.test", market_code: "US", criteria: { query: "gpu" } } },
      null,
      {}
    );
    expect(result.status).toBe(400);
    expect(createEmailAlertMock).not.toHaveBeenCalled();
  });

  it("forwards normalized fields and returns 202", async () => {
    createEmailAlertMock.mockResolvedValue({
      status: "pending_confirmation",
      watchlist_id: "22222222-2222-4222-8222-222222222222",
      email_delivery: "sent"
    } as any);

    const result: any = await createHandler(
      {
        method: "POST",
        headers: {},
        body: {
          email: " User@Example.TEST ",
          locale: "fr",
          market_code: "FR",
          criteria: { query: "vélo cargo", price_max: 800 }
        }
      },
      null,
      {}
    );

    expect(result.status).toBe(202);
    expect(result.body.data.status).toBe("pending_confirmation");
    expect(createEmailAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.test",
        marketCode: "FR",
        currency: "EUR",
        queryText: "vélo cargo",
        priceMax: 800
      })
    );
  });
});

describe("GET /v1/alerts/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a token", async () => {
    const result: any = await confirmHandler({ method: "GET", headers: {}, query: {} }, null, {});
    expect(result.status).toBe(400);
    expect(confirmEmailAlertMock).not.toHaveBeenCalled();
  });

  it("redirects to the marketing site on success", async () => {
    confirmEmailAlertMock.mockResolvedValue({
      status: "confirmed",
      watchlist_id: "22222222-2222-4222-8222-222222222222"
    } as any);

    const result: any = await confirmHandler({ method: "GET", headers: {}, query: { token: "abc.def" } }, null, {});
    expect(result.status).toBe(302);
    expect(result.headers?.Location).toContain("alert=confirmed");
  });

  it("propagates token errors", async () => {
    confirmEmailAlertMock.mockRejectedValue(
      Object.assign(new Error("Confirmation link expired"), { status: 410, code: "ALERT_TOKEN_EXPIRED" })
    );

    const result: any = await confirmHandler({ method: "GET", headers: {}, query: { token: "expired" } }, null, {});
    expect(result.status).toBe(410);
    expect(result.body.error.code).toBe("ALERT_TOKEN_EXPIRED");
  });
});
