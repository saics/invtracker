import { describe, expect, it } from "vitest";
import { computeItemPnl } from "../src/portfolio";
import { parseSteamPrice } from "../src/providers/steam";
import { csfloatTradeToRow, isDmarketCsv, parseDmarketCsv, parseTransactionsCsv } from "../src/transactions";
import { normalizeInventory, parseStickers } from "../src/inventory";

describe("parseSteamPrice", () => {
  it.each([
    ["$1.23", 123],
    ["$1,234.56", 123456],
    ["$1,234", 123400],
    ["1.234,56€", 123456],
    ["12,--€", 1200],
    ["0,03€", 3],
    ["", null],
    [undefined, null],
  ])("%s -> %s", (raw, cents) => expect(parseSteamPrice(raw)).toBe(cents));
});

describe("computeItemPnl", () => {
  it("unrealized for held items", () => {
    expect(computeItemPnl("held", { price: 1000, fee: 0 }, undefined, 1500)).toMatchObject({
      cost: 1000,
      value: 1500,
      pnl: 500,
      pnlPct: 50,
    });
  });
  it("realized for sold items, net of fees", () => {
    expect(computeItemPnl("sold", { price: 1000, fee: 50 }, { price: 1200, fee: 24 }, 9999)).toMatchObject({
      cost: 1050,
      proceeds: 1176,
      value: null,
      pnl: 126,
    });
  });
  it("no pnl without cost basis", () => {
    expect(computeItemPnl("held", undefined, undefined, 1500).pnl).toBeNull();
  });
});

describe("csfloatTradeToRow", () => {
  const trade = {
    id: "t1",
    state: "verified",
    buyer_id: "me",
    seller_id: "other",
    created_at: "2026-01-01T00:00:00Z",
    verified_at: "2026-01-02T00:00:00Z",
    contract: { id: "c1", price: 2500, item: { market_hash_name: "AK-47 | Redline (Field-Tested)", float_value: 0.2 } },
  };
  it("maps a buy", () => {
    expect(csfloatTradeToRow(trade, "me", 2)).toMatchObject({ type: "buy", price: 2500, fee: 0, externalId: "csfloat:t1" });
  });
  it("maps a sale with fee", () => {
    expect(csfloatTradeToRow({ ...trade, buyer_id: "x", seller_id: "me" }, "me", 2)).toMatchObject({ type: "sell", fee: 50 });
  });
  it("skips unfinished trades", () => {
    expect(csfloatTradeToRow({ ...trade, state: "cancelled" }, "me", 2)).toBeNull();
  });
});

describe("parseTransactionsCsv", () => {
  it("parses rows and reports errors", () => {
    const csv = [
      "date,type,platform,market_hash_name,price,fee,float,note",
      '2026-03-01,buy,Skinswap,"AWP | Asiimov (Field-Tested)",95.5,,0.31,"first, cheap"',
      "2026-03-02,buy,nowhere,Foo,1,,,",
    ].join("\r\n");
    const { rows, errors } = parseTransactionsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: "skinswap", price: 95.5, floatValue: 0.31, note: "first, cheap" });
    expect(errors[0]?.line).toBe(3);
  });
});

describe("parseDmarketCsv", () => {
  const csv = [
    "\uFEFFtype;status;title;closed_at_utc;finalization_time_utc;currency;price_api_units;fee_currency;fee_api_units;fee_fraction;offer_id;target_id;asset_id;offer_created_at_utc;amount_raw",
    ";;;;;;;;;;;;;;",
    "buy;successful;AWP | Printstream (Well-Worn);2026-09-10T12:03:21.000Z;2026-09-16T19:00:00.000Z;USD;38,42;USD;;;o1;t1;a1;;1",
    "buy;successful;★ Shadow Daggers | Crimson Web (Minimal Wear);2026-09-10T12:03:21.000Z;2026-09-10T12:03:21.000Z;USD;85,14;USD;;;o2;t2;a2;;1",
    "sell;successful;Foo;2026-09-11T10:00:00.000Z;2026-09-11T10:00:00.000Z;USD;1.234,56;USD;24,69;0,02;o3;t3;a3;;1",
    "buy;failed;Bar;2026-09-11T10:00:00.000Z;;USD;1,00;USD;;;o4;t4;a4;;1",
  ].join("\r\n");

  it("detects the format", () => {
    expect(isDmarketCsv(csv)).toBe(true);
    expect(isDmarketCsv("date,type,platform,market_hash_name,price,fee,float,note")).toBe(false);
  });

  it("parses successful trades with decimal commas", () => {
    const { rows, errors, skipped } = parseDmarketCsv(csv);
    expect(errors).toEqual([]);
    expect(skipped).toBe(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      externalId: "dmarket:buy:o1",
      marketHashName: "AWP | Printstream (Well-Worn)",
      type: "buy",
      platform: "dmarket",
      price: 3842,
      fee: 0,
      note: "trade lock do 2026-09-16",
    });
    expect(rows[0]!.date.toISOString()).toBe("2026-09-10T12:03:21.000Z");
    expect(rows[1]).toMatchObject({ marketHashName: "★ Shadow Daggers | Crimson Web (Minimal Wear)", price: 8514, note: null });
    expect(rows[2]).toMatchObject({ type: "sell", price: 123456, fee: 2469 });
  });
});

describe("inventory parsing", () => {
  it("joins assets with descriptions", () => {
    const desc = {
      classid: "1",
      instanceid: "0",
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      icon_url: "abc",
      marketable: 1,
      tradable: 0,
      tags: [{ category: "Rarity", localized_tag_name: "Classified", color: "d32ce6" }],
      actions: [{ name: "Inspect", link: "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S%owner_steamid%A%assetid%D1" }],
      descriptions: [
        { type: "html", name: "sticker_info", value: '<center><img src="x"><br>Sticker: Natus Vincere (Holo) | Katowice 2014, Crown (Foil)</center>' },
      ],
    };
    const [item] = normalizeInventory({ assets: [{ assetid: "42", classid: "1", instanceid: "0" }], descriptions: [desc] }, "7656");
    expect(item).toMatchObject({ assetId: "42", rarity: "Classified", rarityColor: "#d32ce6", marketable: true, tradable: false });
    expect(item?.inspectLink).toContain("S7656A42D1");
    expect(parseStickers(desc)).toEqual(["Natus Vincere (Holo) | Katowice 2014", "Crown (Foil)"]);
  });
});
