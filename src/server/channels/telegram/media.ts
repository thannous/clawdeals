function buildTelegramApiUrl(token: string, path: string) {
  return `https://api.telegram.org/bot${token}/${path}`;
}

function buildTelegramFileUrl(token: string, filePath: string) {
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

function requireToken(token: any) {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) {
    const err: any = new Error("TELEGRAM_BOT_TOKEN is required");
    err.status = 500;
    err.code = "MISSING_TELEGRAM_BOT_TOKEN";
    throw err;
  }
  return t;
}

async function fetchJson(url: string, init: any = {}) {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!resp.ok) {
    const err: any = new Error(`Telegram API error (${resp.status})`);
    err.status = 502;
    err.code = "TELEGRAM_API_ERROR";
    err.details = { status: resp.status, body: json };
    throw err;
  }
  return json;
}

export async function getTelegramFileInfo({ token, fileId }: { token: string; fileId: string }) {
  const t = requireToken(token);
  if (!fileId || typeof fileId !== "string") {
    const err: any = new Error("fileId is required");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const url = buildTelegramApiUrl(t, `getFile?file_id=${encodeURIComponent(fileId)}`);
  const json: any = await fetchJson(url, { method: "GET" });
  const result = json?.result || null;
  const file_path = typeof result?.file_path === "string" ? result.file_path : null;
  const file_size = typeof result?.file_size === "number" && Number.isFinite(result.file_size) ? result.file_size : null;
  if (!file_path) {
    const err: any = new Error("Telegram getFile: missing file_path");
    err.status = 502;
    err.code = "TELEGRAM_API_ERROR";
    throw err;
  }
  return { file_path, file_size };
}

export async function downloadTelegramFileBytes({
  token,
  filePath,
  maxBytes,
  timeoutMs = 15000
}: {
  token: string;
  filePath: string;
  maxBytes: number;
  timeoutMs?: number;
}) {
  const t = requireToken(token);
  if (!filePath || typeof filePath !== "string") {
    const err: any = new Error("filePath is required");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    const err: any = new Error("maxBytes is required");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const url = buildTelegramFileUrl(t, filePath);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method: "GET", signal: ctrl.signal });
    if (!resp.ok) {
      const err: any = new Error(`Telegram file download error (${resp.status})`);
      err.status = 502;
      err.code = "TELEGRAM_DOWNLOAD_ERROR";
      throw err;
    }

    const contentLength = resp.headers.get("content-length");
    if (contentLength) {
      const n = Number(contentLength);
      if (Number.isFinite(n) && n > maxBytes) {
        const err: any = new Error("File too large");
        err.status = 400;
        err.code = "FILE_TOO_LARGE";
        err.details = { max_bytes: maxBytes, content_length: n };
        throw err;
      }
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.byteLength > maxBytes) {
      const err: any = new Error("File too large");
      err.status = 400;
      err.code = "FILE_TOO_LARGE";
      err.details = { max_bytes: maxBytes, bytes: buf.byteLength };
      throw err;
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export function sniffImageMime(buffer: Buffer) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.byteLength < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function readUint16BE(buf: Buffer, offset: number) {
  return (buf[offset] << 8) | buf[offset + 1];
}

export function stripJpegExif(buffer: Buffer) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.byteLength < 4) return buffer;
  // Must start with SOI.
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;

  const chunks: Buffer[] = [];
  chunks.push(buffer.subarray(0, 2));

  let offset = 2;
  while (offset + 2 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Not a valid marker; give up and return original.
      return buffer;
    }

    const marker = buffer[offset + 1];
    // EOI or SOS: copy the rest and stop.
    if (marker === 0xd9 || marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      return Buffer.concat(chunks);
    }

    // All other markers we handle require a length field.
    if (offset + 4 > buffer.length) return buffer;

    const len = readUint16BE(buffer, offset + 2);
    if (!Number.isFinite(len) || len < 2) return buffer;
    const segmentStart = offset;
    const segmentEnd = offset + 2 + len;
    if (segmentEnd > buffer.length) return buffer;

    const isApp1 = marker === 0xe1;
    if (isApp1) {
      const payload = buffer.subarray(offset + 4, Math.min(segmentEnd, offset + 10));
      const isExif =
        payload.length >= 6 &&
        payload[0] === 0x45 &&
        payload[1] === 0x78 &&
        payload[2] === 0x69 &&
        payload[3] === 0x66 &&
        payload[4] === 0x00 &&
        payload[5] === 0x00;
      if (isExif) {
        // Skip APP1 Exif.
        offset = segmentEnd;
        continue;
      }
    }

    chunks.push(buffer.subarray(segmentStart, segmentEnd));
    offset = segmentEnd;
  }

  return buffer;
}
