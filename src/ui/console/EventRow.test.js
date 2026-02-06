import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EventRow from "./EventRow";

function renderRow(props) {
  return render(createElement(EventRow, props));
}

const baseEvent = {
  id: "evt-1",
  type: "deal.created",
  ts: "2026-02-06T14:30:45.123Z",
  actor: { type: "agent", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  entity: { type: "deal", id: "12345678-abcd-efgh-ijkl-mnopqrstuvwx" },
  payload: { title: "Great Deal" },
  payload_truncated: false
};

describe("EventRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders timestamp in HH:mm:ss.SSS format", () => {
    renderRow({ event: baseEvent });
    const ts = screen.getByTestId("event-ts");
    expect(ts.textContent).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("renders event type badge", () => {
    renderRow({ event: baseEvent });
    const type = screen.getByTestId("event-type");
    expect(type.textContent).toBe("deal.created");
  });

  it("renders entity with truncated ID (8 chars)", () => {
    renderRow({ event: baseEvent });
    const entity = screen.getByTestId("event-entity");
    expect(entity.textContent).toContain("deal");
    expect(entity.textContent).toContain("12345678");
  });

  it("renders actor with truncated ID", () => {
    renderRow({ event: baseEvent });
    const actor = screen.getByTestId("event-actor");
    expect(actor.textContent).toContain("agent");
    expect(actor.textContent).toContain("aaaaaaaa");
  });

  it("renders payload summary", () => {
    renderRow({ event: baseEvent });
    const payload = screen.getByTestId("event-payload");
    expect(payload.textContent).toContain("Great Deal");
  });

  it("shows (truncated) when payload_truncated is true", () => {
    const truncatedEvent = { ...baseEvent, payload: {}, payload_truncated: true };
    renderRow({ event: truncatedEvent });
    const payload = screen.getByTestId("event-payload");
    expect(payload.textContent).toBe("(truncated)");
  });

  it("does not render links in payload (security)", () => {
    const eventWithUrl = {
      ...baseEvent,
      payload: { url: "https://evil.com/steal" }
    };
    renderRow({ event: eventWithUrl });
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(0);
  });

  it("calls onClick with event on click", () => {
    const handleClick = vi.fn();
    renderRow({ event: baseEvent, onClick: handleClick });
    fireEvent.click(screen.getByTestId("event-row"));
    expect(handleClick).toHaveBeenCalledWith(baseEvent);
  });

  it("applies primary color classes for deal.* events", () => {
    renderRow({ event: baseEvent });
    const type = screen.getByTestId("event-type");
    expect(type.className).toContain("text-primary");
  });

  it("applies secondary color classes for watchlist.* events", () => {
    const watchlistEvent = { ...baseEvent, type: "watchlist.match" };
    renderRow({ event: watchlistEvent });
    const type = screen.getByTestId("event-type");
    expect(type.className).toContain("text-secondary");
  });

  it("applies muted color classes for agent.* events", () => {
    const agentEvent = { ...baseEvent, type: "agent.registered" };
    renderRow({ event: agentEvent });
    const type = screen.getByTestId("event-type");
    expect(type.className).toContain("text-muted");
  });
});
