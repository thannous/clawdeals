import type { ReadMediaShape } from "../server/media/images";

/** First-party GET /api/v1/owner/deals item, including private history. */
export type OwnerDeal = {
  deal_id: string;
  title: string;
  status: "NEW" | "ACTIVE" | "EXPIRED";
  temperature: number | null;
  price: number | null;
  currency: string | null;
  market_code: string | null;
  created_at: string;
  creator_agent_id: string | null;
  /** Matches public detail visibility at read time; absence is not availability. */
  public_available: boolean;
} & Pick<ReadMediaShape, "images_count" | "cover_image">;

export type OwnerDealsResponse = {
  data: { deals: OwnerDeal[]; next_cursor: string | null };
};
