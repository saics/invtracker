import { items, transactions, type DB, type ItemSticker, type NewItem } from "@inv/db";
import { and, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { fetchJson } from "./http";
import { decodeInspectCertificate } from "./inspect";

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
/** Per-asset properties Steam added in late 2025: 1 = pattern, 2 = float, 6 = inspect certificate. */
type SteamAssetProperties = {
  assetid: string;
  asset_properties?: { propertyid: number; int_value?: string; float_value?: string; string_value?: string }[];
};
type SteamInventoryPage = {
  success?: number;
  assets?: SteamAsset[];
  descriptions?: SteamDescription[];
  asset_properties?: SteamAssetProperties[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
};

const ICON_CDN = "https://community.fastly.steamstatic.com/economy/image/";

const KIND_BY_PREFIX: Record<string, ItemSticker["kind"]> = { sticker: "sticker", patch: "patch", charm: "charm" };

/**
 * Stickers, patches and charms from the HTML blobs Steam embeds in item descriptions
 * (`sticker_info` / `keychain_info`), in the same order as in the inspect certificate.
 */
export function parseStickers(desc: Pick<SteamDescription, "descriptions">): ItemSticker[] {
  const out: ItemSticker[] = [];
  for (const d of desc.descriptions ?? []) {
    if (!/sticker_info|keychain_info/.test(`${d.name ?? ""} ${d.value}`)) continue;
    const imgs = [...d.value.matchAll(/<img[^>]*?src="([^"]+)"[^>]*?title="(?:Souvenir )?(Sticker|Patch|Charm):\s*([^"]+)"/gi)];
    if (imgs.length) {
      for (const [, image, kind, name] of imgs) out.push({ kind: KIND_BY_PREFIX[kind!.toLowerCase()]!, name: name!.trim(), image });
      continue;
    }
    const m = d.value.match(/<br>(?:Souvenir )?(Sticker|Patch|Charm):\s*([^<]+)<\/center>/i);
    if (m?.[2]) {
      const kind = KIND_BY_PREFIX[m[1]!.toLowerCase()]!;
      for (const name of m[2].split(/,\s*(?![^()]*\))/).map((s) => s.trim()).filter(Boolean)) out.push({ kind, name });
    }
  }
  return out;
}

/** Adds slot and scrape (stickers, patches) or pattern (charms) from the decoded inspect certificate. */
export function withInspectData(stickers: ItemSticker[], certificate: string | undefined): ItemSticker[] {
  const data = certificate ? decodeInspectCertificate(certificate) : null;
  if (!data) return stickers;
  const applied = stickers.filter((s) => s.kind !== "charm");
  const charms = stickers.filter((s) => s.kind === "charm");
  // Both lists come in the same order as the HTML; only trust index matching when the counts line up.
  const sd = data.stickers.length === applied.length ? data.stickers : [];
  const cd = data.charms.length === charms.length ? data.charms : [];
  return [
    ...applied.map((s, i) => (sd[i] ? { ...s, slot: sd[i].slot, wear: sd[i].wear ?? 0 } : s)),
    ...charms.map((s, i) => (cd[i] ? { ...s, slot: cd[i].slot, pattern: cd[i].pattern } : s)),
  ];
}

export function normalizeInventory(page: Pick<SteamInventoryPage, "assets" | "descriptions" | "asset_properties">, steamId: string) {
  const byClass = new Map<string, SteamDescription>();
  for (const d of page.descriptions ?? []) byClass.set(`${d.classid}_${d.instanceid}`, d);

  const props = new Map<string, Map<number, string>>();
  for (const p of page.asset_properties ?? []) {
    const byId = new Map<number, string>();
    for (const x of p.asset_properties ?? []) {
      const v = x.float_value ?? x.int_value ?? x.string_value;
      if (v != null) byId.set(x.propertyid, v);
    }
    props.set(p.assetid, byId);
  }

  const result: NewItem[] = [];
  for (const a of page.assets ?? []) {
    const d = byClass.get(`${a.classid}_${a.instanceid}`);
    if (!d) continue;
    const tag = (cat: string) => d.tags?.find((t) => t.category === cat);
    const p = props.get(a.assetid);
    const num = (id: number) => {
      const v = Number(p?.get(id));
      return p?.has(id) && Number.isFinite(v) ? v : null;
    };
    // Old links use %owner_steamid%/%assetid%; since late 2025 they embed the certificate as %propid:6%.
    const inspect = d.actions
      ?.find((x) => x.link.includes("csgo_econ_action_preview"))
      ?.link.replace("%owner_steamid%", steamId)
      .replace("%assetid%", a.assetid)
      .replace(/%propid:(\d+)%/g, (_, id: string) => p?.get(Number(id)) ?? "");
    result.push({
      assetId: a.assetid,
      marketHashName: d.market_hash_name,
      iconUrl: d.icon_url ? ICON_CDN + d.icon_url : null,
      rarity: tag("Rarity")?.localized_tag_name ?? null,
      rarityColor: tag("Rarity")?.color ? `#${tag("Rarity")!.color}` : null,
      exterior: tag("Exterior")?.localized_tag_name ?? null,
      type: tag("Type")?.localized_tag_name ?? null,
      floatValue: num(2),
      paintSeed: num(1),
      stickers: withInspectData(parseStickers(d), p?.get(6)),
      inspectLink: inspect ?? null,
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
          // Steam is authoritative when it reports a float; otherwise keep one from an import.
          floatValue: sql`coalesce(excluded.float_value, ${items.floatValue})`,
          paintSeed: sql`coalesce(excluded.paint_seed, ${items.paintSeed})`,
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

  // Fill in floats on linked transactions that were imported without one (CSV, manual entry).
  await db
    .update(transactions)
    .set({ floatValue: sql`(select ${items.floatValue} from ${items} where ${items.id} = ${transactions.itemId})` })
    .where(and(isNull(transactions.floatValue), isNotNull(transactions.itemId)));

  const [{ held } = { held: 0 }] = await db
    .select({ held: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.status, "held"));
  return { fetched: fetched.length, held, markedGone: gone.length };
}
