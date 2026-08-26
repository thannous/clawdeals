import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const APPROVAL_ID = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  router: {
    query: { id: "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de" },
    locale: "en",
    asPath: "/my/approvals/a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
    push: vi.fn(),
    replace: vi.fn()
  }
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router
}));

vi.mock("./useMyApprovalAction", () => ({
  useMyApprovalAction: () => ({
    execute: mocks.execute,
    submitState: "idle",
    error: null
  })
}));

import MyApprovalDetailPage from "./MyApprovalDetailPage";

describe("MyApprovalDetailPage mission approval sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              approval_id: APPROVAL_ID,
              state: "PENDING",
              action_type: "offer_over_budget",
              action_ref: {
                mission_id: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
                amount: 1350,
                currency: "EUR"
              },
              action_payload_redacted: {
                offer: { amount: 1350, currency: "EUR" },
                policy: { reason: "hard_budget_exceeded", hard_budget_max: 1300 }
              },
              created_at: "2026-08-26T10:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains the action, reason, consequence, and sends an edited amount", async () => {
    render(<MyApprovalDetailPage />);

    expect(await screen.findByTestId("editable-offer-approval-sheet")).toBeTruthy();
    expect(screen.getByText("detail.missionOffer.requestedAction")).toBeTruthy();
    expect(screen.getByText("detail.missionOffer.limitReason")).toBeTruthy();
    expect(screen.getByText("detail.missionOffer.consequences")).toBeTruthy();

    const amount = screen.getByTestId("approval-offer-amount");
    expect((amount as HTMLInputElement).value).toBe("1350");
    fireEvent.change(amount, { target: { value: "1290" } });
    fireEvent.click(screen.getByRole("button", { name: "detail.approve" }));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(APPROVAL_ID, "approve", { amount: 1290 });
    });
  });

  it("denies without attaching the editable amount", async () => {
    render(<MyApprovalDetailPage />);
    await screen.findByTestId("editable-offer-approval-sheet");

    fireEvent.click(screen.getByRole("button", { name: "detail.deny" }));

    expect(mocks.execute).toHaveBeenCalledWith(APPROVAL_ID, "deny");
  });
});
