export type SseFrame = {
  id: string | null;
  event: string;
  data: string;
};

export class SseParser {
  private buffer = "";
  private eventName: string | null = null;
  private eventId: string | null = null;
  private dataLines: string[] = [];

  feed(chunk: string): SseFrame[] {
    if (!chunk) return [];
    this.buffer += chunk;

    const frames: SseFrame[] = [];

    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) break;

      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);

      // Blank line dispatches the event.
      if (line === "") {
        if (this.dataLines.length > 0) {
          frames.push({
            id: this.eventId,
            event: this.eventName || "message",
            data: this.dataLines.join("\n")
          });
        }
        this.eventName = null;
        this.eventId = null;
        this.dataLines = [];
        continue;
      }

      // Comment line.
      if (line.startsWith(":")) continue;

      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      if (field === "event") {
        this.eventName = value;
      } else if (field === "id") {
        this.eventId = value || null;
      } else if (field === "data") {
        this.dataLines.push(value);
      }
      // Ignore retry and unknown fields.
    }

    return frames;
  }
}

