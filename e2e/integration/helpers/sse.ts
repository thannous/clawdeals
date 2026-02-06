import { Redis } from "@upstash/redis";

import { getApiBaseUrl } from "./env";
import { sleep } from "./ids";

export function createRedis() {
  return Redis.fromEnv();
}

export async function openSse(pathname: string, { headers }: { headers?: Record<string, string> } = {}) {
  const controller = new AbortController();
  const requestHeaders: Record<string, string> = { ...(headers || {}) };

  // Disable compression for SSE: Node's fetch sends gzip/br by default and the
  // decompressor can buffer small heartbeats (": ping"), breaking streaming.
  if (!Object.keys(requestHeaders).some((key) => key.toLowerCase() === "accept-encoding")) {
    requestHeaders["Accept-Encoding"] = "identity";
  }

  const res = await fetch(`${getApiBaseUrl()}${pathname}`, {
    method: "GET",
    headers: requestHeaders,
    signal: controller.signal
  });

  return { res, controller };
}

export type SseCommentFrame = { type: "comment"; comment: string };
export type SseEventFrame = { type: "event"; id: string | null; event: string | null; data: string };
export type SseFrame = SseCommentFrame | SseEventFrame;

type SseReaderState = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
};

const sseStateByResponse = new WeakMap<Response, SseReaderState>();

export async function waitForSseFrame(
  response: Response,
  {
    timeoutMs = 2500,
    onFrame
  }: { timeoutMs?: number; onFrame?: (frame: SseFrame) => SseFrame | undefined } = {}
): Promise<SseFrame> {
  if (!response?.body || typeof response.body.getReader !== "function") {
    throw new Error("SSE response body is not a readable stream");
  }

  let state = sseStateByResponse.get(response);
  if (!state) {
    state = {
      reader: response.body.getReader(),
      decoder: new TextDecoder(),
      buffer: ""
    };
    sseStateByResponse.set(response, state);
  }

  const { reader, decoder } = state;
  const start = Date.now();

  function handleFrame(text: string): SseFrame | null {
    const lines = text.split("\n").filter((l) => l !== "");
    if (lines.length === 0) return null;

    if (lines[0].startsWith(":")) {
      const comment = lines.map((l) => l.slice(1).trim()).join("\n");
      return { type: "comment", comment };
    }

    const frame: SseEventFrame = { type: "event", id: null, event: null, data: "" };
    for (const line of lines) {
      if (line.startsWith("id:")) frame.id = line.slice(3).trim();
      if (line.startsWith("event:")) frame.event = line.slice(6).trim();
      if (line.startsWith("data:")) {
        const chunk = line.slice(5).trim();
        frame.data = frame.data ? `${frame.data}\n${chunk}` : chunk;
      }
    }
    return frame;
  }

  function takeMatchingFrameFromBuffer(): SseFrame | undefined {
    let idx: number;
    while ((idx = state!.buffer.indexOf("\n\n")) !== -1) {
      const raw = state!.buffer.slice(0, idx);
      state!.buffer = state!.buffer.slice(idx + 2);
      const frame = handleFrame(raw);
      if (!frame) continue;

      if (typeof onFrame === "function") {
        const result = onFrame(frame);
        if (result !== undefined) return result;
        continue;
      }

      return frame;
    }
    return undefined;
  }

  while (Date.now() - start < timeoutMs) {
    const buffered = takeMatchingFrameFromBuffer();
    if (buffered !== undefined) return buffered;

    const remainingMs = timeoutMs - (Date.now() - start);
    const readPromise = reader.read();
    const result = await Promise.race([readPromise, sleep(Math.max(0, remainingMs)).then(() => ({ __timeout: true }))]);

    if ((result as any)?.__timeout) {
      // Prevent unhandled rejections if the read settles after we give up.
      readPromise.catch(() => {});
      break;
    }

    const { value, done } = result as ReadableStreamReadResult<Uint8Array>;
    if (done) break;
    state!.buffer += decoder.decode(value, { stream: true });
  }

  const trailing = takeMatchingFrameFromBuffer();
  if (trailing !== undefined) return trailing;

  throw new Error("Timed out waiting for SSE frame");
}
