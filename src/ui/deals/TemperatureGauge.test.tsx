import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TemperatureGauge from "./TemperatureGauge";

afterEach(cleanup);

describe("TemperatureGauge", () => {
  it("does not render 'Hidden' text for NEW deals (P7)", () => {
    render(<TemperatureGauge temperature={0} status="NEW" />);

    const container = screen.getByTestId("temp-hidden");
    expect(container).toBeTruthy();
    // Should NOT contain visible "Hidden" text label
    expect(container.textContent).toBe("");
    // Should have a title tooltip instead
    expect(container.getAttribute("title")).toBe("Temperature hidden for new deals");
  });

  it("renders temperature gauge for ACTIVE deals", () => {
    render(<TemperatureGauge temperature={75} status="ACTIVE" />);

    const gauge = screen.getByTestId("temp-gauge");
    expect(gauge).toBeTruthy();
    expect(gauge.textContent).toContain("75");
  });

  it("clamps temperature to 0-100 range", () => {
    render(<TemperatureGauge temperature={150} status="ACTIVE" />);

    expect(screen.getByTestId("temp-gauge").textContent).toContain("100");
  });

  it("defaults to 0 for non-numeric temperature", () => {
    render(<TemperatureGauge temperature={null} status="ACTIVE" />);

    expect(screen.getByTestId("temp-gauge").textContent).toContain("0");
  });
});
