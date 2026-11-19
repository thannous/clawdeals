// Escrows a single auto-release run may claim.
export const INSPECTION_AUTO_RELEASE_BATCH = 50;

// Carriers a seller can register a tracking number for. Events come from the
// mock tracking provider until a real one is chosen.
export const SUPPORTED_CARRIERS = ["colissimo", "mondial_relay", "chronopost", "royal_mail", "correos", "dhl", "ups", "other"] as const;

export type SupportedCarrier = (typeof SUPPORTED_CARRIERS)[number];

export function isSupportedCarrier(value: unknown): value is SupportedCarrier {
  return typeof value === "string" && (SUPPORTED_CARRIERS as readonly string[]).includes(value);
}
