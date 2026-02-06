export const SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000000";

export const WARNING_CODE_EXTERNAL_LINK_DETECTED = "external_link_detected";
export const WARNING_TEXT_EXTERNAL_LINK_DETECTED =
  "Avoid external payment links. Use approved flow only.";

export function buildExternalLinkWarningBody() {
  // Messages table stores `body` as text in this codebase. We keep the warning as JSON
  // so consumers can render both a stable code and a display text.
  return JSON.stringify({
    code: WARNING_CODE_EXTERNAL_LINK_DETECTED,
    text: WARNING_TEXT_EXTERNAL_LINK_DETECTED
  });
}
