import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionGateMock } = vi.hoisted(() => ({ sessionGateMock: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join(",")}` : key
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>
}));
vi.mock("../auth/useOwnerSessionGate", () => ({
  useOwnerSessionGate: () => sessionGateMock()
}));

import OwnerDealVote from "./OwnerDealVote";

const deal = {
  deal_id: "d2db4d40-8f3f-4d3e-ae1c-64c88440c9ef",
  votes_up: 0,
  votes_down: 0
};

describe("OwnerDealVote", () => {
  beforeEach(() => sessionGateMock.mockReturnValue("authenticated"));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not render zero counters and records a signed-in owner vote", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { deal: { votes_up: 1, votes_down: 0 } } })
    } as Response);
    render(<OwnerDealVote deal={deal} localePrefix="" />);

    expect(screen.queryByTestId("owner-vote-counts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "up" }));
    fireEvent.change(screen.getByPlaceholderText("reasonPlaceholder"), { target: { value: "Verified retailer price" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("success"));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/owner/deals/${deal.deal_id}/vote`,
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("offers a sign-in link without calling the protected endpoint", () => {
    sessionGateMock.mockReturnValue("anonymous");
    render(<OwnerDealVote deal={deal} localePrefix="/fr" />);
    const link = screen.getByText("signIn").closest("a");
    expect(link?.getAttribute("href")).toContain("/fr/auth/login?next=");
  });
});
