import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PageHeader from "./PageHeader";

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/", push: vi.fn(), replace: vi.fn() })
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>
}));

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders title with slash", () => {
    render(<PageHeader title="DEALS" />);

    expect(screen.getByRole("heading", { level: 1, name: "/DEALS" })).toBeTruthy();
  });

  it("renders custom left slot", () => {
    render(<PageHeader left={<a href="/prev">Back</a>} />);

    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
  });

  it("renders actions on the right", () => {
    render(
      <PageHeader
        title="DEALS"
        actions={<button type="button">Open</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
  });

  it("renders children below header line", () => {
    render(
      <PageHeader title="DEALS">
        <div>Subnav</div>
      </PageHeader>
    );

    expect(screen.getByText("Subnav")).toBeTruthy();
  });

  it("renders locale dropdown by default", () => {
    render(<PageHeader title="DEALS" />);

    expect(screen.getByRole("button", { name: /EN/i })).toBeTruthy();
  });

  it("hides locale dropdown when hideLocale is set", () => {
    render(<PageHeader title="DEALS" hideLocale />);

    expect(screen.queryByRole("button", { name: /EN/i })).toBeNull();
  });
});
