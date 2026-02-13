import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageHeader from "./PageHeader";

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
});
