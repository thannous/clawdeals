import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/acquisition", () => ({
  parsePublicAcquisitionEvent: vi.fn(),
  recordPublicAcquisitionEvent: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/acquisition/events";
import {
  parsePublicAcquisitionEvent,
  recordPublicAcquisitionEvent
} from "../../../../server/services/acquisition";

const parseMock = vi.mocked(parsePublicAcquisitionEvent);
const recordMock = vi.mocked(recordPublicAcquisitionEvent);

describe("POST /v1/acquisition/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a parsed event without exposing a database result", async () => {
    const parsed = {
      acquisition_id: "018f3c2a-1e4b-4f8a-9ac0-0123456789ab",
      event_name: "landing_view"
    } as any;
    parseMock.mockReturnValue(parsed);
    recordMock.mockResolvedValue(undefined);

    const response: any = await handler({ method: "POST", body: parsed });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(recordMock).toHaveBeenCalledWith(parsed);
  });

  it("rejects non-POST requests and returns bounded validation errors", async () => {
    const validationError = Object.assign(new Error("event_name is not allowed"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
    parseMock.mockImplementation(() => {
      throw validationError;
    });

    const methodResponse: any = await handler({ method: "GET" });
    const invalidResponse: any = await handler({ method: "POST", body: {} });

    expect(methodResponse.status).toBe(405);
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe("VALIDATION_ERROR");
  });
});
