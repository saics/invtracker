import { items, type DB, type NewItem } from "@inv/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { fetchJson } from "./http";

type SteamAsset = { assetid: string; classid: string; instanceid: string };
type SteamTag = { category: string; localized_tag_name: string; color?: string };
type SteamDescription = {
  classid: string;
  instanceid: string;
  market_hash_name: string;
  icon_url?: string;
  tradable?: number;
  marketable?: number;
  tags?: SteamTag[];
  actions?: { link: string; name: string }[];
  descriptions?: { type: string; value: string; name?: string }[];
};
type SteamInventoryPage = {
  success?: number;
  assets?: SteamAsset[];
  descriptions?: SteamDescription[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
};

const ICON_CDN = "https://community.fastly.steamstatic.com/economy/image/";

/** Sticker/charm names from the HTML blob Steam embeds in item descriptions. */
export function parseStickers(desc: SteamDescription): string[] {
  const out: string[] = [];
  for (const d of desc.descriptions ?? []) {
    if (d.name !== "sticker_info" && !d.value.includes("sticker_info")) continue;
    const m = d.value.match(/<br>(?:Sticker|Patch|Charm):\s*([^<]+)<\/center>/i);
    if (m?.[1]) out.push(...m[1].split(/,\s*(?![^()]*\))/).map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

export function normalizeInventory(page: Pick<SteamInventoryPage, "assets" | "descriptions">, steamId: string) {
  const byClass = new Map<string, SteamDescription>();
  for (const d of page.descriptions ?? []) byClass.set(`${d.classid}_${d.instanceid}`, d);

  const result: NewItem[] = [];
  for (const a of page.assets ?? []) {
    const d = byClass.get(`${a.classid}_${a.instanceid}`);
    if (!d) continue;
    const tag = (cat: string) => d.tags?.find((t) => t.category === cat);
    const inspect = d.actions?.find((x) => x.link.includes("csgo_econ_action_preview"))?.link;
    result.push({
      assetId: a.assetid,
      marketHashName: d.market_hash_name,
      iconUrl: d.icon_url ? ICON_CDN + d.icon_url : null,
      rarity: tag("Rarity")?.localized_tag_name ?? null,
      rarityColor: tag("Rarity")?.color ? `#${tag("Rarity")!.color}` : null,
      exterior: tag("Exterior")?.localized_tag_name ?? null,
      type: tag("Type")?.localized_tag_name ?? null,
      stickers: parseStickers(d),
      inspectLink: inspect?.replace("%owner_steamid%", steamId).replace("%assetid%", a.assetid) ?? null,
      tradable: d.tradable === 1,
      marketable: d.marketable === 1,
    });
  }
  return result;
}

export async function fetchSteamInventory(steamId: string): Promise<NewItem[]> {
  const all: NewItem[] = [];
  let start: string | undefined;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ l: "english", count: "2000" });
    if (start) q.set("start_assetid", start);
    const page = await fetchJson<SteamInventoryPage>(
      `https://steamcommunity.com/inventory/${steamId}/730/2?${q}`,
      { minGapMs: 1_500 },
    );
    all.push(...normalizeInventory(page, steamId));
    if (!page.more_items || !page.last_assetid) break;
    start = page.last_assetid;
  }
  return all;
}

/**
 * Upserts the current Steam inventory. Items that disappeared are marked `gone`
 * (traded/sold elsewhere) unless already linked to a recorded sale.
 */
export async function syncInventory(db: DB, steamId = process.env.STEAM_ID ?? "") {
  if (!/^\d{17}$/.test(steamId)) throw new Error("STEAM_ID must be a 17-digit SteamID64");
  const fetched = await fetchSteamInventory(steamId);
  const now = new Date();

  for (const it of fetched) {
    await db
      .insert(items)
      .values({ ...it, status: "held", firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: items.assetId,
        set: {
          marketHashName: it.marketHashName,
          iconUrl: it.iconUrl,
          rarity: it.rarity,
          rarityColor: it.rarityColor,
          exterior: it.exterior,
          type: it.type,
          stickers: it.stickers,
          inspectLink: it.inspectLink,
          tradable: it.tradable,
          marketable: it.marketable,
          status: "held",
          lastSeenAt: now,
        },
      });
  }

  const present = fetched.map((i) => i.assetId!).filter(Boolean);
  const goneWhere = present.length
    ? and(eq(items.status, "held"), notInArray(items.assetId, present))
    : eq(items.status, "held");
  const gone = await db.update(items).set({ status: "gone" }).where(goneWhere).returning({ id: items.id });

  const [{ held } = { held: 0 }] = await db
    .select({ held: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.status, "held"));
  return { fetched: fetched.length, held, markedGone: gone.length };
}
