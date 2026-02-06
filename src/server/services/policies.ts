import { getSupabaseServiceClient } from "../db/supabase";
import { canonicalJsonStringify } from "../utils/canonical-json";
import { createDefaultPolicy, normalizePolicyInput, stripPolicyVersion } from "../policy/policy";
import { ensureOwnerExists } from "./owners";
import { mapSupabaseError } from "./supabase-errors";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildPolicyRecord({ ownerId, policy, version, updatedAt, policyId, createdAt }) {
  return {
    policy_id: policyId ?? null,
    owner_id: ownerId,
    version,
    policy_json: policy,
    updated_at: updatedAt ?? null,
    created_at: createdAt ?? null
  };
}

function policyComparable(policy) {
  const normalized = normalizePolicyInput(stripPolicyVersion(policy));
  return canonicalJsonStringify(normalized);
}

function normalizePolicyRecord(record) {
  if (!record) return null;
  const policyJson = isPlainObject(record.policy_json) ? record.policy_json : {};
  const normalized = normalizePolicyInput(policyJson);
  const policyVersion = Number.isInteger(record.version) ? record.version : policyJson.version || 1;
  return {
    ...record,
    policy_json: {
      ...policyJson,
      ...normalized,
      version: policyVersion
    }
  };
}

export async function getPolicyForOwner(ownerId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("policies").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return normalizePolicyRecord(data);
}

export async function getPolicyOrDefault(ownerId) {
  const existing = await getPolicyForOwner(ownerId);
  if (existing) return existing;
  const fallback = createDefaultPolicy();
  return buildPolicyRecord({
    ownerId,
    policy: fallback,
    version: fallback.version,
    updatedAt: null,
    policyId: null,
    createdAt: null
  });
}

export async function ensurePolicyForOwner(ownerId, { now = new Date() } = {}) {
  const existing = await getPolicyForOwner(ownerId);
  if (existing) return existing;

  await ensureOwnerExists(ownerId);
  const policy = createDefaultPolicy();
  const payload = {
    owner_id: ownerId,
    version: policy.version,
    policy_json: policy,
    updated_at: now.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("policies").insert(payload).select("*").single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return normalizePolicyRecord(data);
}

export async function upsertPolicy({ ownerId, policy, expectedVersion, now = new Date() }) {
  const client = getSupabaseServiceClient();
  const normalized = normalizePolicyInput(policy);
  const existing = await getPolicyForOwner(ownerId);
  const nowIso = now.toISOString();

  if (!existing) {
    if (expectedVersion != null && expectedVersion !== 1) {
      throw Object.assign(new Error("Policy version mismatch"), {
        status: 409,
        code: "VERSION_CONFLICT"
      });
    }
    await ensureOwnerExists(ownerId);
    const version = 1;
    const policyJson = { ...normalized, version };
    const payload = {
      owner_id: ownerId,
      version,
      policy_json: policyJson,
      updated_at: nowIso
    };

    const { data, error } = await client.from("policies").insert(payload).select("*").single();
    if (error) {
      const mapped = mapSupabaseError(error);
      throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
    }
    return data;
  }

  if (expectedVersion == null) {
    throw Object.assign(new Error("policy version is required"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  if (expectedVersion !== existing.version) {
    throw Object.assign(new Error("Policy version mismatch"), {
      status: 409,
      code: "VERSION_CONFLICT"
    });
  }

  const nextComparable = canonicalJsonStringify(normalized);
  const existingComparable = policyComparable(existing.policy_json);
  if (nextComparable === existingComparable) {
    return normalizePolicyRecord(existing);
  }

  const nextVersion = existing.version + 1;
  const policyJson = { ...normalized, version: nextVersion };
  const { data, error } = await client
    .from("policies")
    .update({ policy_json: policyJson, version: nextVersion, updated_at: nowIso })
    .eq("owner_id", ownerId)
    .eq("version", existing.version)
    .select("*");

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  if (!data || data.length === 0) {
    throw Object.assign(new Error("Policy version mismatch"), {
      status: 409,
      code: "VERSION_CONFLICT"
    });
  }

  return normalizePolicyRecord(data[0]);
}
