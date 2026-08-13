// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://clawdeals.com/fr/mcp" }

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcquisitionTelemetry from "./AcquisitionTelemetry";

const routerMock = vi.hoisted(() => ({
  isReady: true,
  asPath: "/fr/mcp",
  locale: "fr"
}));

vi.mock("next/router", () => ({
  useRouter: () => routerMock
}));

const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(new Response(null, { status: 202 }))
);

function renderTrackedLink() {
  return render(
    <>
      <AcquisitionTelemetry />
      <a
        href="https://app.clawdeals.com/fr/start"
        data-acquisition-cta="mcp"
        target="_blank"
      >
        <span>Connect</span>
      </a>
    </>
  );
}

function latestPayload() {
  const options = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return JSON.parse(String(options?.body));
}

describe("AcquisitionTelemetry", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn(() => false)
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tracks a modified primary click and propagates the acquisition id", async () => {
    const view = renderTrackedLink();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();

    fireEvent.click(view.getByText("Connect"), { button: 0, metaKey: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(latestPayload()).toMatchObject({
      event_name: "connect_cta_clicked",
      landing_path: "/fr/mcp",
      cta_location: "mcp",
      interaction_type: "primary_click"
    });
    expect(view.getByRole("link").getAttribute("href")).toMatch(
      /[?&]acq_id=[^&]+/
    );
  });

  it("tracks a middle-button auxclick without preventing native navigation", async () => {
    const view = renderTrackedLink();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();

    const event = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1
    });
    view.getByText("Connect").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(latestPayload()).toMatchObject({
      event_name: "connect_cta_clicked",
      cta_location: "mcp",
      interaction_type: "auxclick"
    });
    expect(view.getByRole("link").getAttribute("href")).toMatch(
      /[?&]acq_id=[^&]+/
    );
  });

  it("ignores a right-button auxclick", async () => {
    const view = renderTrackedLink();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockClear();

    fireEvent(
      view.getByText("Connect"),
      new MouseEvent("auxclick", { bubbles: true, button: 2 })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.getByRole("link").getAttribute("href")).toBe(
      "https://app.clawdeals.com/fr/start"
    );
  });
});
