import { describe, expect, it } from "vitest";
import { computeItemPnl, ownershipWindow } from "../src/portfolio";
import { computeMarketSeries, weightedMedian } from "../src/market";
import { parseSkinportItems, parseSkinportSales } from "../src/providers/skinport";
import { csfloatTradeToRow, parseTransactionsCsv, skinswapTxToRows } from "../src/transactions";
import { normalizeInventory, parseStickers, withInspectData } from "../src/inventory";
import { decodeInspectCertificate } from "../src/inspect";

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

describe("skinswapTxToRows", () => {
  const base = { id: "s1", type: "china", status: "completed", value: -100, createdAt: "2026-10-12T23:24:53.093Z" };
  const item = (id: number, price: number, deliveryOutcome?: string) => ({ id, market_hash_name: `Item ${id}`, price, deliveryOutcome });

  it("puts the balance charged above list price into fee", () => {
    const [row] = skinswapTxToRows({ ...base, balanceChange: -140, siteItems: [item(1, 100, "delivered")] });
    expect(row).toMatchObject({ type: "buy", platform: "skinswap", price: 100, fee: 40, externalId: "skinswap:s1:1" });
  });
  it("splits a multi-item trade by listed price", () => {
    const rows = skinswapTxToRows({ ...base, type: "trade", value: -1930, balanceChange: -1930, siteItems: [item(1, 1930), item(2, 67)] });
    expect(rows.map((r) => r.price + r.fee!)).toEqual([1865, 65]);
  });
  it("skips failed, refunded and non-purchase rows", () => {
    expect(skinswapTxToRows({ ...base, status: "failed", siteItems: [item(1, 100)] })).toEqual([]);
    expect(skinswapTxToRows({ ...base, siteItems: [item(1, 100, "refunded")] })).toEqual([]);
    expect(skinswapTxToRows({ ...base, type: "deposit", value: 500, siteItems: [] })).toEqual([]);
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
    expect(parseStickers(desc).map((s) => s.name)).toEqual(["Natus Vincere (Holo) | Katowice 2014", "Crown (Foil)"]);
  });

  // Real item: 2 stickers (donk scraped 75%) + a souvenir charm, as returned by Steam in late 2025.
  const cert =
    "5242AEB5BC9B9A534A7A72D2537A5662566AAFB5ACBD5112F05330465A514292164F5252126D6F02C5E76F1792D40F6E30465A5142CC747F5252CE906F6ED7A46F176A403AEF3AC7532256F053445A5242016FFE65901217BD3A896D1F94F8B2120A9154734D4B20";
  const img = (title: string) => `<img width=64 height=48 src="https://cdn/${title.length}.png" title="${title}">`;
  const desc = {
    classid: "2",
    instanceid: "0",
    market_hash_name: "SSG 08 | Rapid Transit (Minimal Wear)",
    actions: [{ name: "Inspect in Game...", link: "steam://run/730//+csgo_econ_action_preview%20%propid:6%" }],
    descriptions: [
      {
        type: "html",
        name: "sticker_info",
        value: `<center>${img("Sticker: donk (Foil) | Austin 2025")}${img("Sticker: Cyber Romanov (Holo)")}<br>Sticker: donk (Foil) | Austin 2025, Cyber Romanov (Holo)</center>`,
      },
      {
        type: "html",
        name: "keychain_info",
        value: `<center>${img("Souvenir Charm: Budapest 2025 Highlight | ZywOo vs FaZe on Inferno")}<br>Souvenir Charm: Budapest 2025 Highlight | ZywOo vs FaZe on Inferno</center>`,
      },
    ],
  };
  const page = {
    assets: [{ assetid: "53841998844", classid: "2", instanceid: "0" }],
    descriptions: [desc],
    asset_properties: [
      {
        assetid: "53841998844",
        asset_properties: [
          { propertyid: 1, int_value: "162" },
          { propertyid: 2, float_value: "0.124855019152164459" },
          { propertyid: 6, string_value: cert },
        ],
      },
    ],
  };

  it("decodes the inspect certificate", () => {
    const data = decodeInspectCertificate(cert)!;
    expect(data.paintWear).toBeCloseTo(0.124855019, 8);
    expect(data.paintSeed).toBe(162);
    expect(data.stickers.map((s) => s.id)).toEqual([8768, 4894]);
    expect(decodeInspectCertificate("not hex")).toBeNull();
  });

  it("takes float, pattern, sticker scrape and inspect link from asset properties", () => {
    const [item] = normalizeInventory(page, "7656");
    expect(item).toMatchObject({ floatValue: 0.124855019152164459, paintSeed: 162 });
    expect(item?.inspectLink).toBe(`steam://run/730//+csgo_econ_action_preview%20${cert}`);
    expect(item?.stickers).toMatchObject([
      { kind: "sticker", name: "donk (Foil) | Austin 2025", wear: 0.75, slot: 3 },
      { kind: "sticker", name: "Cyber Romanov (Holo)", wear: 0, slot: 3 },
      { kind: "charm", name: "Budapest 2025 Highlight | ZywOo vs FaZe on Inferno" },
    ]);
  });

  it("leaves scrape unknown when counts do not line up", () => {
    const stickers = parseStickers(desc).slice(0, 1);
    expect(withInspectData(stickers, cert)[0]?.wear).toBeUndefined();
  });
});

describe("ownershipWindow", () => {
  const DAY = 86_400_000;
  const firstSync = new Date("2026-10-18T10:00:00Z");
  const base = { status: "held" as const, firstSeenAt: firstSync, lastSeenAt: firstSync, buy: null, sell: null };
  type Row = Parameters<typeof ownershipWindow>[0];
  it("items present at the first sync count as owned since forever", () => {
    expect(ownershipWindow(base as Row, firstSync.getTime())).toEqual({ from: -Infinity, to: Infinity });
  });
  it("a recorded buy sets the start, a sale the end", () => {
    const buy = { date: new Date("2026-05-01") };
    const sell = { date: new Date("2026-08-01") };
    expect(ownershipWindow({ ...base, status: "sold", buy, sell } as unknown as Row, firstSync.getTime())).toEqual({
      from: buy.date.getTime(),
      to: sell.date.getTime(),
    });
  });
  it("items that showed up later start when first seen", () => {
    const seen = new Date(firstSync.getTime() + 3 * DAY);
    expect(ownershipWindow({ ...base, firstSeenAt: seen } as Row, firstSync.getTime()).from).toBe(seen.getTime());
  });
});

describe("weightedMedian", () => {
  it("weights values by count", () => {
    expect(weightedMedian([{ price: 100, weight: 1 }, { price: 200, weight: 5 }, { price: 900, weight: 1 }])).toBe(200);
  });
  it("is null without weight", () => expect(weightedMedian([{ price: 100, weight: 0 }])).toBeNull());
});

describe("computeMarketSeries", () => {
  const empty = { csfloatSales: [], skinportSales: [], csfloatListing: [], skinportListing: [] };

  it("uses CSFloat sales over 7 days and ignores a single outlier day", () => {
    const series = computeMarketSeries(
      {
        ...empty,
        csfloatSales: [
          { day: "2026-10-10", price: 1000, volume: 4 },
          { day: "2026-10-11", price: 1100, volume: 4 },
          { day: "2026-10-12", price: 9000, volume: 1 },
        ],
      },
      "2026-10-12",
    );
    expect(series.map((p) => [p.day, p.price, p.basis])).toEqual([
      ["2026-10-10", 1000, "csfloat_sales_7d"],
      ["2026-10-11", 1000, "csfloat_sales_7d"],
      ["2026-10-12", 1100, "csfloat_sales_7d"],
    ]);
  });

  it("widens to 30 days for thinly traded items, then falls back to Skinport and listings", () => {
    const series = computeMarketSeries(
      {
        csfloatSales: [{ day: "2026-09-01", price: 500, volume: 3 }],
        skinportSales: [{ day: "2026-10-15", price: 700, volume: 2 }],
        csfloatListing: [{ day: "2026-10-17", price: 650 }],
        skinportListing: [{ day: "2026-10-19", price: 800 }],
      },
      "2026-10-23",
    );
    const at = (day: string) => series.find((p) => p.day === day);
    expect(at("2026-09-05")).toMatchObject({ price: 500, basis: "csfloat_sales_7d" });
    expect(at("2026-09-15")).toMatchObject({ price: 500, basis: "csfloat_sales_30d" });
    expect(at("2026-10-16")).toMatchObject({ price: 700, basis: "skinport_sales_7d" });
    // Observations older than 3 days are not used, so each source hands over to the next one.
    expect(at("2026-10-19")).toMatchObject({ price: 650, basis: "csfloat_listing" });
    expect(at("2026-10-21")).toMatchObject({ price: 800, basis: "skinport_listing" });
    expect(at("2026-10-23")).toBeUndefined();
  });

  it("returns nothing without observations", () => expect(computeMarketSeries(empty, "2026-10-12")).toEqual([]));
});

describe("Skinport parsing", () => {
  it("converts to cents and prefers the base entry over Doppler phases", () => {
    const items = parseSkinportItems([
      { market_hash_name: "★ Karambit | Doppler (Factory New)", version: "Phase 2", min_price: 900, median_price: 950, quantity: 2 },
      { market_hash_name: "★ Karambit | Doppler (Factory New)", version: null, min_price: 700.5, median_price: 800, quantity: 9 },
      { market_hash_name: "Empty", version: null, min_price: null, median_price: null, quantity: 0 },
    ]);
    expect(items.get("★ Karambit | Doppler (Factory New)")).toEqual({ minPrice: 70050, quantity: 9 });
    expect(items.has("Empty")).toBe(false);
  });

  it("reads 7 and 30 day sale stats", () => {
    const stats = { min: 1, max: 2, avg: 1.5, median: 1.4, volume: 3 };
    const sales = parseSkinportSales([
      { market_hash_name: "X", version: null, last_24_hours: stats, last_7_days: stats, last_30_days: { ...stats, median: null, volume: 0 }, last_90_days: stats },
    ]);
    expect(sales.get("X")).toEqual({ median7d: 140, volume7d: 3, median30d: null, volume30d: 0 });
  });
});
