import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DeviceStatusBadge from "./DeviceStatusBadge";

describe("DeviceStatusBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it.each(["PENDING", "AUTHORIZED", "DENIED", "EXPIRED", "UNKNOWN"])(
    "renders the %s status",
    (status) => {
      render(<DeviceStatusBadge status={status} />);

      expect(screen.getByTestId("device-status").textContent).toBe(status);
    }
  );

  it("renders a fallback for an empty status", () => {
    render(<DeviceStatusBadge status="" />);

    expect(screen.getByTestId("device-status").textContent).toBe("—");
  });
});
