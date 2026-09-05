import { isSyntheticDealSource } from "../utils/synthetic-deal";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { normalizeReadMedia } from "../media/images";

const PUBLIC_DEAL_STATUSES = new Set(["NEW", "ACTIVE", "EXPIRED"]);

function mapError(error: any): never {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isMissingDealMediaColumns(error: any) {
  const message = error?.message || "";
  if (typeof message !== "string") return false;
  const referencesMediaColumns = message.includes("images") || message.includes("cover_image_index");
  const missingColumnHint = message.includes("does not exist") || message.toLowerCase().includes("schema cache");
  return referencesMediaColumns && missingColumnHint;
}

function toNumber(value: any) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

export type PublicDeal = {
  deal_id: string;
  title: string;
  source_url: string | null;
  price: number | null;
  currency: string | null;
  expires_at: string | null;
  status: string;
  temperature: number | null;
  votes_up: number | null;
  votes_down: number | null;
  tags: string[];
  deal_type: string;
  country: string | null;
  merchant_name: string | null;
  merchant_domain: string | null;
  images_count: number;
  cover_image: any;
  created_at: string;
};

export async function getPublicDeal(dealId: string): Promise<PublicDeal | null> {
  if (!dealId || typeof dealId !== "string") return null;

  const client = getSupabaseServiceClient();
  const selectWithMedia =
    "deal_id,title,source_url,price,currency,expires_at,status,temperature,votes_up,votes_down,tags,deal_type,country,merchant_name,merchant_domain,images,cover_image_index,created_at";
  const selectWithoutMedia =
    "deal_id,title,source_url,price,currency,expires_at,status,temperature,votes_up,votes_down,tags,deal_type,country,merchant_name,merchant_domain,created_at";

  let data: any = null;
  let error: any = null;

  ({ data, error } = await client.from("deals").select(selectWithMedia).eq("deal_id", dealId).maybeSingle());

  if (error && isMissingDealMediaColumns(error)) {
    ({ data, error } = await client.from("deals").select(selectWithoutMedia).eq("deal_id", dealId).maybeSingle());
    if (!error && data) {
      data = { ...data, images: null, cover_image_index: null };
    }
  }

  if (error) mapError(error);
  if (!data || isSyntheticDealSource(data.source_url)) return null;
  if (!PUBLIC_DEAL_STATUSES.has(data.status)) return null;

  const { data: moderationState, error: moderationError } = await client
    .from("moderation_states")
    .select("hidden")
    .eq("entity_type", "deal")
    .eq("entity_id", dealId)
    .maybeSingle();

  if (moderationError) mapError(moderationError);
  if (moderationState?.hidden) return null;

  const media = normalizeReadMedia({
    rawImages: data?.images,
    rawCoverImageIndex: data?.cover_image_index,
  });

  return {
    deal_id: data.deal_id,
    title: data.title,
    source_url: data.source_url || null,
    price: toNumber(data.price),
    currency: data.currency || null,
    expires_at: data.expires_at || null,
    status: data.status,
    temperature: data.status === "NEW" ? null : toNumber(data.temperature),
    votes_up: toNumber(data.votes_up),
    votes_down: toNumber(data.votes_down),
    tags: data.tags || [],
    deal_type: data.deal_type || "ONLINE",
    country: data.country || null,
    merchant_name: data.merchant_name || null,
    merchant_domain: data.merchant_domain || null,
    images_count: media.images_count,
    cover_image: media.cover_image,
    created_at: data.created_at,
  };
}
