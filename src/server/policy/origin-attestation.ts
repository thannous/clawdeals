import { getChannelIdentity } from "../services/channel-identities";
import { ORIGIN_CONTEXT_KIND, resolveOriginContext } from "./authority";

type AttestationResult =
  | {
      ok: true;
      originContext: any;
      source: string | null;
      attested: boolean;
      requestedOriginContext: any;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: Record<string, any>;
    };

function normalizeText(value: any): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveOriginContextFromChannelIdentity(identity: any): string {
  const channelType = normalizeText(identity?.channel_type).toLowerCase();
  // Current Telegram and WhatsApp webhook flows are direct/private-only.
  if (channelType === "telegram" || channelType === "whatsapp") {
    return ORIGIN_CONTEXT_KIND.CONTROL_DM;
  }

  const channelUserId = normalizeText(identity?.channel_user_id);
  const channelContextId = normalizeText(identity?.channel_context_id);
  if (!channelUserId || !channelContextId) {
    return ORIGIN_CONTEXT_KIND.UNKNOWN;
  }
  return channelContextId === channelUserId ? ORIGIN_CONTEXT_KIND.CONTROL_DM : ORIGIN_CONTEXT_KIND.PUBLIC_GROUP;
}

function deriveOriginContextFromRequestOrigin(requestOrigin: any): string | null {
  const origin = normalizeText(requestOrigin).toLowerCase();
  if (!origin) return null;
  // Telegram webhook currently accepts private chats only; treat channel webhook context as CONTROL_DM.
  if (origin === "channel:telegram") return ORIGIN_CONTEXT_KIND.CONTROL_DM;
  // WebMCP is a first-party client entrypoint.
  if (origin === "webmcp") return ORIGIN_CONTEXT_KIND.CONTROL_DM;
  return null;
}

export async function attestOriginContextForOwner({
  ownerId,
  requestedOriginContext,
  channelIdentityId,
  requestOrigin
}: {
  ownerId: string | null;
  requestedOriginContext: any;
  channelIdentityId?: string | null;
  requestOrigin?: string | null;
}): Promise<AttestationResult> {
  const requested = resolveOriginContext({ originContext: requestedOriginContext });
  if (requested.kind === ORIGIN_CONTEXT_KIND.UNKNOWN) {
    return {
      ok: true,
      originContext: requested,
      source: null,
      attested: false,
      requestedOriginContext: requested
    };
  }

  let attestedKind: string | null = null;
  let source: string | null = null;

  if (channelIdentityId) {
    if (!ownerId) {
      return {
        ok: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Owner context required for channel attestation"
      };
    }
    const channelIdentity = await getChannelIdentity({ ownerId, channelIdentityId });
    if (!channelIdentity) {
      return {
        ok: false,
        status: 404,
        code: "CHANNEL_IDENTITY_NOT_FOUND",
        message: "Channel identity not found",
        details: { channel_identity_id: channelIdentityId }
      };
    }

    const derived = deriveOriginContextFromChannelIdentity(channelIdentity);
    if (derived === ORIGIN_CONTEXT_KIND.UNKNOWN) {
      return {
        ok: false,
        status: 409,
        code: "ORIGIN_CONTEXT_UNATTESTABLE",
        message: "Unable to attest origin_context from channel identity",
        details: { channel_identity_id: channelIdentityId }
      };
    }
    attestedKind = derived;
    source = "channel_identity";
  } else {
    attestedKind = deriveOriginContextFromRequestOrigin(requestOrigin);
    source = attestedKind ? "request_origin" : null;
  }

  if (!attestedKind) {
    if (requested.kind !== ORIGIN_CONTEXT_KIND.CONTROL_DM) {
      return {
        ok: false,
        status: 403,
        code: "ORIGIN_CONTEXT_UNATTESTED",
        message: "Non-control origin_context requires server attestation",
        details: {
          origin_context: requested
        }
      };
    }
    return {
      ok: true,
      originContext: requested,
      source: null,
      attested: false,
      requestedOriginContext: requested
    };
  }

  if (requested.kind !== attestedKind) {
    return {
      ok: false,
      status: 409,
      code: "ORIGIN_CONTEXT_MISMATCH",
      message: "origin_context does not match server-attested origin",
      details: {
        origin_context: requested,
        attested_origin_context: { kind: attestedKind },
        channel_identity_id: channelIdentityId || null
      }
    };
  }

  return {
    ok: true,
    originContext: { ...requested, kind: attestedKind, inferred: false },
    source,
    attested: true,
    requestedOriginContext: requested
  };
}
