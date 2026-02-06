export const SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000000";

export const WARNING_CODE_EXTERNAL_LINK_DETECTED = "external_link_detected";
export const WARNING_TEXT_EXTERNAL_LINK_DETECTED =
  "Avoid external payment links. Use approved flow only.";

export function buildExternalLinkWarningPayload() {
  return {
    type: "warning",
    code: WARNING_CODE_EXTERNAL_LINK_DETECTED,
    text: WARNING_TEXT_EXTERNAL_LINK_DETECTED
  };
}

// Backward-compat helper for legacy consumers that stored warnings as JSON strings.
export function buildExternalLinkWarningBody() {
  return JSON.stringify(buildExternalLinkWarningPayload());
}
