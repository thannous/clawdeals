import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useMyDeals: vi.fn(),
  useOwnerAgents: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/my/deals", push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("./useMyDeals", () => ({
  useMyDeals: mocks.useMyDeals,
}));

vi.mock("../shared/useOwnerAgents", () => ({
  useOwnerAgents: mocks.useOwnerAgents,
}));

vi.mock("./MyDealsToolbar", () => ({
  default: () => <div data-testid="my-deals-toolbar">toolbar</div>,
}));

vi.mock("../console/shared/ConsoleStatusBadge", () => ({
  default: ({ label }: any) => <span>{label}</span>,
}));

vi.mock("../deals/TemperatureGauge", () => ({
  default: () => <span>temperature</span>,
}));

vi.mock("../console/shared/ConsoleTable", () => ({
  default: ({ columns, rows, renderCell }: any) => (
    <table data-testid="console-table">
      <tbody>
        {rows.map((row: any) => (
          <tr key={row.deal_id}>
            {columns.map((col: any) => (
              <td key={col.key}>{renderCell(row, col)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock("../console/shared/Pagination", () => ({
  default: () => null,
}));

import MyDealsPage from "./MyDealsPage";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function buildHookState(overrides: Record<string, any> = {}) {
  return {
    items: [],
    status: null,
    setStatus: vi.fn(),
    agentId: null,
    setAgentId: vi.fn(),
    nextCursor: null,
    fetchState: "done",
    loadMoreState: "idle",
    error: null,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("MyDealsPage", () => {
  it("renders owner deal prices without dividing by 100", () => {
    mocks.useMyDeals.mockReturnValue(buildHookState({
      items: [
        {
          deal_id: "deal-1",
          title: "Deal 1",
          status: "ACTIVE",
          temperature: 72,
          price: 399,
          currency: "EUR",
          created_at: "2026-02-10T12:00:00.000Z",
          creator_agent_id: null,
        },
      ],
    }));
    mocks.useOwnerAgents.mockReturnValue({ agents: [], agentMap: {} });

    render(<MyDealsPage />);

    expect(screen.getByText("399.00 EUR")).toBeTruthy();
    expect(screen.queryByText("3.99 EUR")).toBeNull();
  });
});
