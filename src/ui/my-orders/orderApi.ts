export type OrderView = any;

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function parse(resp: Response) {
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw Object.assign(new Error(body?.error?.message || `HTTP ${resp.status}`), {
      status: resp.status,
      code: body?.error?.code || null
    });
  }
  return body;
}

export async function getJson(url: string, signal?: AbortSignal) {
  return parse(await fetch(url, { signal }));
}

export async function postJson(url: string, data: Record<string, unknown> = {}) {
  return parse(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey() },
      body: JSON.stringify(data)
    })
  );
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const EVIDENCE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Reserve a slot, send the file to private storage, then confirm it with its hash.
export async function uploadEvidenceFile(disputeId: string, file: File) {
  const base = `/api/v1/disputes/${encodeURIComponent(disputeId)}`;
  const { upload } = await postJson(`${base}/evidence`);
  const bytes = await file.arrayBuffer();

  const put = await fetch(upload.url, { method: "PUT", headers: { "Content-Type": file.type }, body: bytes });
  if (!put.ok) {
    throw new Error(`Upload failed (HTTP ${put.status})`);
  }

  return postJson(`${base}/evidence:confirm`, {
    bucket: upload.bucket,
    key: upload.key,
    sha256: await sha256Hex(bytes),
    content_type: file.type,
    bytes: bytes.byteLength
  });
}

// Escrow amounts carry the accepted offer amount as-is, the way offers are shown elsewhere.
export function formatMoney(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined || amount === "") return "-";
  return `${String(amount)} ${typeof currency === "string" ? currency : ""}`.trim();
}
