export type EntityRef = {
  type: string;
  id: string;
};

export type CardAction = {
  // Stable ID for analytics and future cross-channel mapping.
  action_id: string;
  label: string;

  // Stable command identifier that is safe to round-trip via Telegram callback_data.
  command_id: string;
  args?: Record<string, string | number | boolean | null | undefined>;
  // Optional URL action (Telegram inline keyboard supports URL buttons).
  // When set, channels should prefer rendering it as a link rather than a callback.
  url?: string | null;
  // Optional layout hint (row index) for channels with inline keyboards.
  row?: number;
};

export type Card = {
  title: string;
  subtitle?: string | null;
  bullets?: string[] | null;
  actions?: CardAction[] | null;
  entity_ref?: EntityRef | null;
};

export function renderCardPlainText(card: Card): string {
  const lines: string[] = [];
  lines.push(String(card.title || "").trim() || "Card");

  const subtitle = card.subtitle ? String(card.subtitle).trim() : "";
  if (subtitle) lines.push(subtitle);

  const bullets = Array.isArray(card.bullets) ? card.bullets : [];
  for (const b of bullets) {
    const text = String(b || "").trim();
    if (!text) continue;
    lines.push(`- ${text}`);
  }

  // Keep entity refs out of the primary content by default; it is mostly for structured consumers.
  return lines.join("\n").trim();
}
