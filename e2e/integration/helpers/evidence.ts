import { expect, type APIRequestContext } from "@playwright/test";
import crypto from "node:crypto";

import { randomId, sha256Hex } from "./ids";
import { expectStatus } from "./http";

export function buildEvidenceBytes() {
  const payload = `evidence-${randomId()}-${Date.now()}`;
  return Buffer.from(payload, "utf8");
}

export function buildEvidenceHash(bytes: Buffer) {
  return sha256Hex(bytes);
}

export async function initEvidenceUpload(
  request: APIRequestContext,
  { disputeId, apiKey }: { disputeId: string; apiKey: string }
) {
  const res = await request.post(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": randomId()
    }
  });
  await expectStatus(res, 200);
  const body = await res.json();
  expect(body.upload).toBeTruthy();
  expect(body.upload.url).toBeTruthy();
  expect(body.upload.bucket).toBeTruthy();
  expect(body.upload.key).toBeTruthy();
  return body.upload as {
    bucket: string;
    key: string;
    url: string;
    expires_in_seconds: number;
  };
}

export async function uploadEvidenceBytes(
  request: APIRequestContext,
  { url, bytes, contentType }: { url: string; bytes: Buffer; contentType: string }
) {
  const res = await request.put(url, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength)
    },
    data: bytes
  });
  await expectStatus(res, 200);
  return res;
}

export async function confirmEvidenceUpload(
  request: APIRequestContext,
  {
    disputeId,
    apiKey,
    bucket,
    key,
    sha256,
    contentType,
    bytes
  }: {
    disputeId: string;
    apiKey: string;
    bucket: string;
    key: string;
    sha256: string;
    contentType: string;
    bytes: number;
  }
) {
  const res = await request.post(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence:confirm`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": randomId()
    },
    data: {
      bucket,
      key,
      sha256,
      content_type: contentType,
      bytes
    }
  });
  await expectStatus(res, 200);
  const body = await res.json();
  expect(body.evidence_item_id).toBeTruthy();
  return body as { evidence_item_id: string };
}

export function createEvidenceTestFixture() {
  const bytes = buildEvidenceBytes();
  const sha256 = buildEvidenceHash(bytes);
  return {
    bytes,
    sha256,
    contentType: "image/png"
  };
}

export function mutateEvidenceHash(sha256: string) {
  const buf = Buffer.from(sha256, "hex");
  buf[0] = (buf[0] ^ 0xff) & 0xff;
  return buf.toString("hex");
}

export function mutateEvidenceBytes(bytes: Buffer) {
  const mutated = Buffer.from(bytes);
  mutated[0] = (mutated[0] ^ 0xff) & 0xff;
  return mutated;
}

export function computeSha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
