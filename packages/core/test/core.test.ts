import { describe, expect, it } from "vitest";
import { computeItemPnl, ownershipWindow } from "../src/portfolio";
import { parseSteamHistoryPage, parseSteamPrice, steamDaily } from "../src/providers/steam";
import { csfloatTradeToRow, parseTransactionsCsv, skinswapTxToRows } from "../src/transactions";
import { normalizeInventory, parseStickers, withInspectData } from "../src/inventory";
import { decodeInspectCertificate } from "../src/inspect";

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

describe("parseSteamHistoryPage", () => {
  const page = (data: unknown) =>
    `<html><script type="application/json" id="valve-ssr-data" nonce="x">${JSON.stringify(data)}</script></html>`;
  const query = (name: string, ecurrency: number, prices: unknown[]) => ({
    queryKey: ["market", "pricehistory", 730, name],
    state: { data: { ecurrency, prices } },
  });

  it("reads every variant's series from the embedded query state", () => {
    const html = page({
      renderContext: {
        queryData: {
          queries: [
            { queryKey: ["market", "listing", 730], state: { data: {} } },
            query("AK-47 | Redline (Field-Tested)", 3, [
              { time: 1700086400, price_median: 12.5, purchases: 3 },
              { time: 1700000000, price_median: 10, purchases: 1 },
            ]),
            query("StatTrak™ AK-47 | Redline (Field-Tested)", 3, [{ time: 1700000000, price_median: 30, purchases: 1 }]),
          ],
        },
      },
    });
    const res = parseSteamHistoryPage(html)!;
    expect(res.currency).toBe("EUR");
    expect([...res.series.keys()]).toHaveLength(2);
    expect(res.series.get("AK-47 | Redline (Field-Tested)")!.map((p) => p.price)).toEqual([10, 12.5]);
  });

  it("averages hourly points per day, weighted by purchases", () => {
    const day = 1700006400; // 00:00 UTC
    expect(
      steamDaily([
        { time: day + 3600, price_median: 10, purchases: 3 },
        { time: day + 7200, price_median: 20, purchases: 1 },
        { time: day + 86_400, price_median: 5, purchases: 0 },
      ]).map((p) => [p.ts.getTime() / 1000, p.price]),
    ).toEqual([
      [day, 12.5],
      [day + 86_400, 5],
    ]);
  });

  it("returns null without embedded data", () => expect(parseSteamHistoryPage("<html></html>")).toBeNull());
});
