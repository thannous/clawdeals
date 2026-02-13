import { useState, useCallback, useEffect } from "react";
import { useSseStream } from "./useSseStream";
import LiveFeedToolbar from "./LiveFeedToolbar";
import EventList from "./EventList";
import { trackLiveFeedOpened, trackLiveFeedFilterChanged, trackLiveFeedEventClicked } from "./telemetry";
import PageHeader from "../shared/PageHeader";

export default function LiveFeedPage() {
  const [types, setTypes] = useState([]);
  const [entityId, setEntityId] = useState("");

  const { events, paused, pause, resume, connectionState, missedCount } = useSseStream({
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
    if (paused) {
      resume();
    } else {
      pause();
    }
  }, [paused, resume, pause]);

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
      <PageHeader title="LIVE FEED" />

      {/* Main content */}
      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <LiveFeedToolbar
          types={types}
          onTypesChange={handleTypesChange}
          entityId={entityId}
          onEntityIdChange={handleEntityIdChange}
          paused={paused}
          onPauseToggle={handlePauseToggle}
          connectionState={connectionState}
          missedCount={missedCount}
        />

        <EventList
          events={events}
          connectionState={connectionState}
          paused={paused}
          onEventClick={handleEventClick}
        />
      </main>
    </div>
  );
}
