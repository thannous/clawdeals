import { createHmacFingerprint } from "../audit/fingerprint";

export function createChannelUserIdHash({ channelType, channelUserId, secret }: any) {
  if (!secret) {
    throw new Error("AUDIT_HMAC_SECRET is required to hash channel identities.");
  }
  return createHmacFingerprint({
    secret,
    data: {
      channel_type: channelType || null,
      channel_user_id: channelUserId || null
    }
  });
}

export function createChannelContextIdHash({ channelType, channelContextId, secret }: any) {
  if (!secret) {
    throw new Error("AUDIT_HMAC_SECRET is required to hash channel identities.");
  }
  return createHmacFingerprint({
    secret,
    data: {
      channel_type: channelType || null,
      channel_context_id: channelContextId || null
    }
  });
}

export function createChannelFingerprints({
  channelType,
  channelUserId,
  channelContextId,
  secret = process.env.AUDIT_HMAC_SECRET
}: any) {
  return {
    channel_user_id_hash: createChannelUserIdHash({ channelType, channelUserId, secret }),
    channel_context_id_hash: createChannelContextIdHash({ channelType, channelContextId, secret })
  };
}

