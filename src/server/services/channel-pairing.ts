import { evaluatePolicyAction, POLICY_DECISION } from "../policy/evaluate";
import { createChannelFingerprints } from "../utils/channel-fingerprint";
import { createApproval } from "./approvals";
import { getPolicyOrDefault } from "./policies";
import {
  findActiveIdentityByChannel,
  findPendingIdentityByChannel,
  upsertIdentityForPairing
} from "./channel-identities";

function buildServiceError(message, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

export async function pairChannelIdentityForOwner({
  ownerId,
  channelType,
  channelUserId,
  channelContextId,
  displayName,
  now = new Date()
}: any): Promise<{ identity: any; state: "PAIRED" | "PENDING_APPROVAL"; approval?: any | null }> {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");

  const active = await findActiveIdentityByChannel({ channelType, channelUserId, channelContextId });
  if (active) {
    if (active.owner_id !== ownerId) {
      throw buildServiceError("Channel identity is already paired to another owner", 409, "CHANNEL_ALREADY_PAIRED");
    }
    return { identity: active, state: "PAIRED", approval: null };
  }

  const pending = await findPendingIdentityByChannel({ channelType, channelUserId, channelContextId });
  if (pending) {
    if (pending.owner_id !== ownerId) {
      throw buildServiceError("Channel identity is already pending for another owner", 409, "CHANNEL_ALREADY_PAIRED");
    }

    const approval = await ensurePairingApproval({
      ownerId,
      channelIdentity: pending,
      channelType,
      channelUserId,
      channelContextId,
      displayName
    });

    return { identity: pending, state: "PENDING_APPROVAL", approval };
  }

  const policy = await getPolicyOrDefault(ownerId);
  const decision = evaluatePolicyAction({ action: "channel.pair", policy: policy?.policy_json || {} });
  const autoApproved = decision?.decision === POLICY_DECISION.AUTO_APPROVED;

  const desiredState = autoApproved ? "ACTIVE" : "PENDING";

  const identity = await upsertIdentityForPairing({
    ownerId,
    channelType,
    channelUserId,
    channelContextId,
    displayName,
    role: "owner",
    state: desiredState,
    approvedBy: autoApproved ? ownerId : null,
    now
  });

  if (desiredState === "ACTIVE") {
    return { identity, state: "PAIRED", approval: null };
  }

  const approval = await ensurePairingApproval({
    ownerId,
    channelIdentity: identity,
    channelType,
    channelUserId,
    channelContextId,
    displayName
  });

  return { identity, state: "PENDING_APPROVAL", approval };
}

async function ensurePairingApproval({
  ownerId,
  channelIdentity,
  channelType,
  channelUserId,
  channelContextId,
  displayName
}: any) {
  let hashes: any = null;
  try {
    hashes = createChannelFingerprints({ channelType, channelUserId, channelContextId });
  } catch {
    hashes = null;
  }

  const actionRef: any = {
    channel_type: channelType || null,
    channel_identity_id: channelIdentity?.channel_identity_id || null,
    ...(hashes ? hashes : {})
  };

  const payload: any = {
    channel_type: channelType || null,
    display_name: displayName || null
  };

  return createApproval({
    ownerId,
    actionType: "channel.pair",
    actionRef,
    actionRefId: String(channelIdentity.channel_identity_id),
    actionPayload: payload,
    createdByAgentId: null
  });
}

