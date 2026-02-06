import { useState, useCallback, useEffect } from "react";
import { useSseStream } from "./useSseStream";
import LiveFeedToolbar from "./LiveFeedToolbar";
import EventList from "./EventList";
import { trackLiveFeedOpened, trackLiveFeedFilterChanged, trackLiveFeedEventClicked } from "./telemetry";

export default function LiveFeedPage() {
  const [types, setTypes] = useState([]);
  const [entityId, setEntityId] = useState("");

  const stream = useSseStream({
    types: types.length > 0 ? types : undefined,
    entityId: entityId || undefined,
    replay: true,
    heartbeat: 15
  });

  useEffect(() => {
    trackLiveFeedOpened();
  }, []);

  const handleTypesChange = useCallback((newTypes) => {
    setTypes(newTypes);
    trackLiveFeedFilterChanged({ types: newTypes, entityId });
  }, [entityId]);

  const handleEntityIdChange = useCallback((value) => {
    setEntityId(value);
    trackLiveFeedFilterChanged({ types, entityId: value });
  }, [types]);

  const handlePauseToggle = useCallback(() => {
    if (stream.paused) {
      stream.resume();
    } else {
      stream.pause();
    }
  }, [stream]);

  const handleEventClick = useCallback((event) => {
    trackLiveFeedEventClicked({
      eventType: event.type,
      entityType: event.entity?.type,
      entityId: event.entity?.id
    });
  }, []);

  return (
    <div data-testid="live-feed-page" className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>LIVE FEED
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <LiveFeedToolbar
          types={types}
          onTypesChange={handleTypesChange}
          entityId={entityId}
          onEntityIdChange={handleEntityIdChange}
          paused={stream.paused}
          onPauseToggle={handlePauseToggle}
          connectionState={stream.connectionState}
          missedCount={stream.missedCount}
        />

        <EventList
          events={stream.events}
          connectionState={stream.connectionState}
          paused={stream.paused}
          onEventClick={handleEventClick}
        />
      </main>
    </div>
  );
}
