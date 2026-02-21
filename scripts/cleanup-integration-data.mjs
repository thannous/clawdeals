import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { assertNonProdFromEnv } from "./lib/assert-non-prod-target.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const batchSize = 500;
const deleteBatchSize = 50;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

assertNonProdFromEnv(process.env, {
  context: "integration cleanup",
  supabaseKeys: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  apiKeys: ["API_BASE_URL", "E2E_BASE_URL", "SMOKE_BASE_URL"]
});

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const KEEP_OWNER_IDS = new Set([
  "00000000-0000-4000-a000-000000000000"
]);

const KEEP_AGENT_IDS = new Set([
  "00000000-0000-4000-a000-000000000001"
]);

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function hasAnyMatch(set, candidates) {
  for (const candidate of candidates) {
    if (candidate && set.has(candidate)) return true;
  }
  return false;
}

function isTestEmail(email) {
  if (typeof email !== "string") return false;
  const value = email.trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith("itest+")) return true;
  if (value.startsWith("smoke+")) return true;
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const domain = value.slice(at + 1);
  return [
    "example.com",
    "test.local",
    "clawdeals.test",
    "clawdeals.internal",
    "t.l"
  ].includes(domain);
}

function isTestAgentName(name) {
  if (typeof name !== "string") return false;
  const value = name.trim().toLowerCase();
  if (!value) return false;
  return value.startsWith("integration agent") || value.startsWith("smoke ");
}

function extractHostname(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isTestDealSource(url) {
  const host = extractHostname(url);
  if (!host) return false;
  return host === "example.com" || host === "example.invalid" || host.endsWith(".example.com");
}

function isTestListingTitle(title) {
  if (typeof title !== "string") return false;
  const value = title.trim().toLowerCase();
  if (!value) return false;
  return value.startsWith("ti-") || value.startsWith("integration listing ") || value.startsWith("smoke listing ");
}

function isTestDealTitle(title) {
  if (typeof title !== "string") return false;
  const value = title.trim().toLowerCase();
  if (!value) return false;
  return value.startsWith("ti-");
}

function isMissingRelation(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

async function selectAll(table, columns) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + batchSize - 1);

    if (error) {
      if (isMissingRelation(error)) {
        console.warn(`[cleanup] skip missing table ${table}`);
        return [];
      }
      throw new Error(`[cleanup] select failed on ${table}: ${error.message || String(error)}`);
    }

    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return rows;
}

async function deleteIn(table, column, ids, counts, key) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return 0;

  if (dryRun) {
    counts[key] = 0;
    console.log(`[dry-run] ${table}.${column} IN (...) -> ${uniqueIds.length} key(s)`);
    return 0;
  }

  let deleted = 0;
  for (const part of chunk(uniqueIds, deleteBatchSize)) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .in(column, part);

    if (error) {
      if (isMissingRelation(error)) {
        console.warn(`[cleanup] skip missing table ${table}`);
        break;
      }
      throw new Error(`[cleanup] delete failed on ${table}.${column}: ${error.message || String(error)}`);
    }
    deleted += count || 0;
  }

  counts[key] = (counts[key] || 0) + deleted;
  return deleted;
}

async function run() {
  const owners = await selectAll("owners", "owner_id,email");
  const agents = await selectAll("agents", "id,owner_id,name");
  const deals = await selectAll("deals", "deal_id,creator_agent_id,source_url,title");
  const listings = await selectAll("listings", "listing_id,seller_agent_id,title");
  const threads = await selectAll("threads", "thread_id,buyer_agent_id,seller_agent_id,listing_id");
  const offers = await selectAll("offers", "offer_id,buyer_agent_id,seller_agent_id,listing_id,thread_id");
  const transactions = await selectAll("transactions", "tx_id,buyer_agent_id,seller_agent_id,listing_id,thread_id,accepted_offer_id");
  const watchlists = await selectAll("watchlists", "watchlist_id,agent_id");
  const approvals = await selectAll("approvals", "approval_id,owner_id,created_by_agent_id");

  const emailOwnerIds = owners
    .filter((row) => isTestEmail(row?.email))
    .map((row) => row.owner_id);

  const testNameOwnerIds = agents
    .filter((row) => isTestAgentName(row?.name))
    .map((row) => row.owner_id);

  const targetOwnerIds = unique([...emailOwnerIds, ...testNameOwnerIds]).filter((id) => !KEEP_OWNER_IDS.has(id));
  const targetOwnerSet = new Set(targetOwnerIds);

  const targetAgentIds = unique(
    agents
      .filter((row) => targetOwnerSet.has(row?.owner_id) || isTestAgentName(row?.name))
      .map((row) => row.id)
  ).filter((id) => !KEEP_AGENT_IDS.has(id));
  const targetAgentSet = new Set(targetAgentIds);

  const targetDealIds = unique(
    deals
      .filter(
        (row) =>
          targetAgentSet.has(row?.creator_agent_id) ||
          isTestDealSource(row?.source_url) ||
          isTestDealTitle(row?.title)
      )
      .map((row) => row.deal_id)
  );
  const targetDealSet = new Set(targetDealIds);

  const targetListingIds = unique(
    listings
      .filter((row) => targetAgentSet.has(row?.seller_agent_id) || isTestListingTitle(row?.title))
      .map((row) => row.listing_id)
  );
  const targetListingSet = new Set(targetListingIds);

  const targetThreadIds = unique(
    threads
      .filter(
        (row) =>
          targetListingSet.has(row?.listing_id) ||
          hasAnyMatch(targetAgentSet, [row?.buyer_agent_id, row?.seller_agent_id])
      )
      .map((row) => row.thread_id)
  );
  const targetThreadSet = new Set(targetThreadIds);

  const targetOfferIds = unique(
    offers
      .filter(
        (row) =>
          targetListingSet.has(row?.listing_id) ||
          targetThreadSet.has(row?.thread_id) ||
          hasAnyMatch(targetAgentSet, [row?.buyer_agent_id, row?.seller_agent_id])
      )
      .map((row) => row.offer_id)
  );
  const targetOfferSet = new Set(targetOfferIds);

  const targetTxIds = unique(
    transactions
      .filter(
        (row) =>
          targetListingSet.has(row?.listing_id) ||
          targetThreadSet.has(row?.thread_id) ||
          targetOfferSet.has(row?.accepted_offer_id) ||
          hasAnyMatch(targetAgentSet, [row?.buyer_agent_id, row?.seller_agent_id])
      )
      .map((row) => row.tx_id)
  );

  const targetWatchlistIds = unique(
    watchlists
      .filter((row) => targetAgentSet.has(row?.agent_id))
      .map((row) => row.watchlist_id)
  );

  const targetApprovalIds = unique(
    approvals
      .filter(
        (row) => targetOwnerSet.has(row?.owner_id) || targetAgentSet.has(row?.created_by_agent_id)
      )
      .map((row) => row.approval_id)
  );

  console.log("[cleanup] targeted rows");
  console.log(
    JSON.stringify(
      {
        owners: targetOwnerIds.length,
        agents: targetAgentIds.length,
        deals: targetDealIds.length,
        listings: targetListingIds.length,
        threads: targetThreadIds.length,
        offers: targetOfferIds.length,
        transactions: targetTxIds.length,
        watchlists: targetWatchlistIds.length,
        approvals: targetApprovalIds.length,
        dryRun
      },
      null,
      2
    )
  );

  const counts = {};

  await deleteIn("deal_comments", "owner_id", targetOwnerIds, counts, "deal_comments_by_owner");
  await deleteIn("deal_comments", "deal_id", targetDealIds, counts, "deal_comments_by_deal");
  await deleteIn("deal_votes", "agent_id", targetAgentIds, counts, "deal_votes_by_agent");
  await deleteIn("deal_votes", "deal_id", targetDealIds, counts, "deal_votes_by_deal");
  await deleteIn("watchlist_matches", "watchlist_id", targetWatchlistIds, counts, "watchlist_matches_by_watchlist");
  await deleteIn("watchlist_matches", "agent_id", targetAgentIds, counts, "watchlist_matches_by_agent");
  await deleteIn("watchlists", "watchlist_id", targetWatchlistIds, counts, "watchlists");
  await deleteIn("approval_jobs", "approval_id", targetApprovalIds, counts, "approval_jobs");
  await deleteIn("approvals", "approval_id", targetApprovalIds, counts, "approvals");
  await deleteIn("ratings", "tx_id", targetTxIds, counts, "ratings");
  await deleteIn("transactions", "tx_id", targetTxIds, counts, "transactions");
  await deleteIn("offers", "offer_id", targetOfferIds, counts, "offers");
  await deleteIn("messages", "thread_id", targetThreadIds, counts, "messages");
  await deleteIn("threads", "thread_id", targetThreadIds, counts, "threads");
  await deleteIn("listings", "listing_id", targetListingIds, counts, "listings");
  await deleteIn("deals", "deal_id", targetDealIds, counts, "deals");
  await deleteIn("connect_sessions", "owner_id", targetOwnerIds, counts, "connect_sessions_by_owner");
  await deleteIn("connect_sessions", "agent_id", targetAgentIds, counts, "connect_sessions_by_agent");
  await deleteIn("oauth_device_authorizations", "owner_id", targetOwnerIds, counts, "oauth_device_by_owner");
  await deleteIn("oauth_device_authorizations", "agent_id", targetAgentIds, counts, "oauth_device_by_agent");
  await deleteIn("oauth_refresh_tokens", "owner_id", targetOwnerIds, counts, "oauth_refresh_by_owner");
  await deleteIn("oauth_refresh_tokens", "agent_id", targetAgentIds, counts, "oauth_refresh_by_agent");
  await deleteIn("api_keys", "agent_id", targetAgentIds, counts, "api_keys");
  await deleteIn("agent_installations", "owner_id", targetOwnerIds, counts, "agent_installations_by_owner");
  await deleteIn("agent_installations", "agent_id", targetAgentIds, counts, "agent_installations_by_agent");
  await deleteIn("risk_rule_state", "agent_id", targetAgentIds, counts, "risk_rule_state");
  await deleteIn("trustscore_recalc_queue", "agent_id", targetAgentIds, counts, "trustscore_recalc_queue");
  await deleteIn("staged_commands", "owner_id", targetOwnerIds, counts, "staged_commands_by_owner");
  await deleteIn("staged_commands", "agent_id", targetAgentIds, counts, "staged_commands_by_agent");
  await deleteIn("channel_identities", "owner_id", targetOwnerIds, counts, "channel_identities");
  await deleteIn("owner_sessions", "owner_id", targetOwnerIds, counts, "owner_sessions");
  await deleteIn("owner_auth_links", "owner_id", targetOwnerIds, counts, "owner_auth_links");
  await deleteIn("owner_verification_challenges", "owner_id", targetOwnerIds, counts, "owner_verification_challenges");
  await deleteIn("pairing_tokens", "owner_id", targetOwnerIds, counts, "pairing_tokens");
  await deleteIn("policies", "owner_id", targetOwnerIds, counts, "policies");
  await deleteIn("psp_accounts", "owner_id", targetOwnerIds, counts, "psp_accounts");
  await deleteIn("notification_outbox", "owner_id", targetOwnerIds, counts, "notification_outbox");
  await deleteIn("notification_preferences", "owner_id", targetOwnerIds, counts, "notification_preferences");
  await deleteIn("agents", "id", targetAgentIds, counts, "agents");
  await deleteIn("owners", "owner_id", targetOwnerIds, counts, "owners");

  const totalDeleted = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  console.log("[cleanup] done");
  console.log(
    JSON.stringify(
      {
        dryRun,
        totalDeleted,
        counts
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("[cleanup] failed", error?.message || String(error));
  process.exit(1);
});
