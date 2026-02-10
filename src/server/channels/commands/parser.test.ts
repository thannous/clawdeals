import { describe, expect, it } from "vitest";
import { parseCommand } from "./parser";

const UUID = "00000000-0000-4000-a000-000000000123";

describe("parseCommand", () => {
  it("parses help", () => {
    expect(parseCommand("help")).toEqual({ kind: "help" });
  });

  it("parses /start with optional token", () => {
    expect(parseCommand("/start")).toEqual({ kind: "start", pairToken: null });
    expect(parseCommand("/start abc123")).toEqual({ kind: "start", pairToken: "abc123" });
  });

  it("parses /status and strips bot mention", () => {
    expect(parseCommand("/status")).toEqual({ kind: "status" });
    expect(parseCommand("/status@clawdeals_bot")).toEqual({ kind: "status" });
  });

  it("parses approvals list", () => {
    expect(parseCommand("approvals")).toEqual({ kind: "approvals_list" });
    expect(parseCommand("approvals list")).toEqual({ kind: "approvals_list" });
  });

  it("parses approve with confirm", () => {
    expect(parseCommand(`approve ${UUID}`)).toEqual({ kind: "approve", approvalId: UUID, confirm: false });
    expect(parseCommand(`approve ${UUID} confirm`)).toEqual({ kind: "approve", approvalId: UUID, confirm: true });
  });

  it("parses deny with optional reason and confirm", () => {
    expect(parseCommand(`deny ${UUID}`)).toEqual({ kind: "deny", approvalId: UUID, reason: null, confirm: false });
    expect(parseCommand(`deny ${UUID} too expensive`)).toEqual({
      kind: "deny",
      approvalId: UUID,
      reason: "too expensive",
      confirm: false
    });
    expect(parseCommand(`deny ${UUID} too expensive confirm`)).toEqual({
      kind: "deny",
      approvalId: UUID,
      reason: "too expensive",
      confirm: true
    });
  });

  it("parses policies show and deploy status", () => {
    expect(parseCommand("policies show")).toEqual({ kind: "policies_show" });
    expect(parseCommand("deploy status")).toEqual({ kind: "deploy_status" });
  });

  it("parses connect (and pair alias) and unpair", () => {
    expect(parseCommand("connect")).toEqual({ kind: "connect" });
    expect(parseCommand("pair")).toEqual({ kind: "connect" });
    expect(parseCommand(`unpair ${UUID}`)).toEqual({ kind: "unpair", channelIdentityId: UUID, confirm: false });
    expect(parseCommand(`unpair ${UUID} confirm`)).toEqual({ kind: "unpair", channelIdentityId: UUID, confirm: true });
  });

  it("parses /menu (and menu alias) to the Telegram menu", () => {
    expect(parseCommand("/menu")).toEqual({ kind: "menu" });
    expect(parseCommand("menu")).toEqual({ kind: "menu" });
    expect(parseCommand("/menu@clawdeals_bot")).toEqual({ kind: "menu" });
  });

  it("parses stable card callbacks (cd:...)", () => {
    expect(parseCommand("cd:menu.home")).toEqual({ kind: "menu" });
    expect(parseCommand("cd:menu.watchlists:p=2")).toEqual({ kind: "menu_watchlists", page: 2 });
    expect(parseCommand("cd:watchlists.create")).toEqual({ kind: "watchlists_create" });
    expect(parseCommand("cd:menu.approvals")).toEqual({ kind: "menu_approvals" });
    expect(parseCommand("cd:menu.notifications")).toEqual({ kind: "notifications_menu" });
    expect(parseCommand("cd:menu.help")).toEqual({ kind: "menu_help" });

    expect(parseCommand("cd:approvals.page:c=abc")).toEqual({ kind: "approvals_page", cursor: "abc" });
    expect(parseCommand(`cd:approvals.approve:id=${UUID}`)).toEqual({ kind: "approve", approvalId: UUID, confirm: false });
    expect(parseCommand(`cd:approvals.deny:id=${UUID}`)).toEqual({ kind: "deny", approvalId: UUID, reason: null, confirm: false });

    expect(parseCommand("cd:notifications.mode:m=realtime")).toEqual({ kind: "notifications_mode", mode: "REALTIME" });
    expect(parseCommand("cd:notifications.quiet.off")).toEqual({ kind: "notifications_quiet_off" });
    expect(parseCommand("cd:notifications.quiet.set:s=22%3A00&e=08%3A00")).toEqual({
      kind: "notifications_quiet_set",
      start: "22:00",
      end: "08:00"
    });
    expect(parseCommand("cd:notifications.types.toggle:t=watchlist_match")).toEqual({
      kind: "notifications_types_toggle",
      eventType: "watchlist_match"
    });
  });

  it("parses notifications commands", () => {
    expect(parseCommand("notif")).toEqual({ kind: "notifications_menu" });
    expect(parseCommand("notifications")).toEqual({ kind: "notifications_menu" });
    expect(parseCommand("notif mode realtime")).toEqual({ kind: "notifications_mode", mode: "REALTIME" });
    expect(parseCommand("notif mode digest_hourly")).toEqual({ kind: "notifications_mode", mode: "DIGEST_HOURLY" });
    expect(parseCommand("notif mode digest_daily")).toEqual({ kind: "notifications_mode", mode: "DIGEST_DAILY" });
    expect(parseCommand("notif mode silent")).toEqual({ kind: "notifications_mode", mode: "SILENT" });
    expect(parseCommand("notif quiet off")).toEqual({ kind: "notifications_quiet_off" });
    expect(parseCommand("notif quiet 22:00 08:00")).toEqual({ kind: "notifications_quiet_set", start: "22:00", end: "08:00" });
    expect(parseCommand("notif tz Europe/Paris")).toEqual({ kind: "notifications_tz", timezone: "Europe/Paris" });
    expect(parseCommand("notif types toggle watchlist_match")).toEqual({
      kind: "notifications_types_toggle",
      eventType: "watchlist_match"
    });
    expect(parseCommand("notif strong price off")).toEqual({ kind: "notifications_strong_price", maxPriceEur: null });
    expect(parseCommand("notif strong trust 80")).toEqual({ kind: "notifications_strong_trust", minSellerTrustScore: 80 });
  });

  it("parses CONFIRM <code>", () => {
    expect(parseCommand("CONFIRM abc123")).toEqual({ kind: "confirm", code: "abc123" });
    expect(parseCommand("confirm abc123")).toEqual({ kind: "confirm", code: "abc123" });
  });
});
