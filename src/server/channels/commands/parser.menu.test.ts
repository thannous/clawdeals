import { describe, expect, it } from "vitest";

import { parseCommand } from "./parser";

describe("parseCommand (menu)", () => {
  it("parses /menu and menu", () => {
    expect(parseCommand("/menu")).toEqual({ kind: "menu" });
    expect(parseCommand("menu")).toEqual({ kind: "menu" });
  });

  it("parses menu.home callback command", () => {
    expect(parseCommand("menu.home")).toEqual({ kind: "menu" });
  });

  it("parses menu.watchlists with page", () => {
    expect(parseCommand("menu.watchlists")).toEqual({ kind: "menu_watchlists", page: 0 });
    expect(parseCommand("menu.watchlists p=2")).toEqual({ kind: "menu_watchlists", page: 2 });
  });

  it("parses watchlists.create callback command", () => {
    expect(parseCommand("watchlists.create")).toEqual({ kind: "watchlists_create" });
  });
});

