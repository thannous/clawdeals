import { useRef, useEffect } from "react";
import EventRow from "./EventRow";

export default function EventList({ events, connectionState, paused, onEventClick }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, paused]);

  if (connectionState === "connecting") {
    return (
      <div data-testid="event-list-loading" className="flex items-center justify-center h-64 text-xs font-mono text-subtle">
        Connecting to event stream…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div data-testid="event-list-empty" className="flex items-center justify-center h-64 text-xs font-mono text-subtle">
        No events yet. Waiting for activity…
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-testid="event-list"
      className="overflow-y-auto max-h-[calc(100vh-200px)] border border-border rounded bg-surface"
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: "0 800px"
        } as any
      }
    >
      {events.map((event) => (
        <EventRow key={event.id} event={event} onClick={onEventClick} />
      ))}
    </div>
  );
}
