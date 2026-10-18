import { fetchJson } from "../http";

const BASE = "https://csfloat.com/api/v1";

export type CsfloatItem = {
  market_hash_name: string;
  float_value?: number;
  paint_seed?: number;
  asset_id?: string;
  icon_url?: string;
  stickers?: { name?: string }[];
};

export type CsfloatListing = { id: string; price: number; item: CsfloatItem };
export type CsfloatBuyOrder = { id: string; price: number; qty?: number; market_hash_name?: string };

export type CsfloatTrade = {
  id: string;
  state: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  verified_at?: string | null;
  contract: { id: string; price: number; item: CsfloatItem };
};

/** Normalizes endpoints that return either `[...]` or `{ data: [...] }`. */
export function unwrapList<T>(res: unknown, key = "data"): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && Array.isArray((res as Record<string, unknown>)[key])) {
    return (res as Record<string, T[]>)[key]!;
  }
  return [];
}

export class CsfloatClient {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("CSFLOAT_API_KEY is not set");
  }

  private get<T>(path: string) {
    return fetchJson<T>(BASE + path, { headers: { Authorization: this.apiKey }, minGapMs: 700 });
  }

  /** Cheapest active buy-now listing for an exact market_hash_name. */
  async lowestListing(marketHashName: string): Promise<CsfloatListing | null> {
    const q = new URLSearchParams({
      market_hash_name: marketHashName,
      sort_by: "lowest_price",
      type: "buy_now",
      limit: "1",
    });
    const listings = unwrapList<CsfloatListing>(await this.get(`/listings?${q}`));
    return listings.find((l) => l.item?.market_hash_name === marketHashName) ?? null;
  }

  /**
   * Highest buy order for an item. CSFloat exposes buy orders per listing, so we
   * look them up through the cheapest listing of the same market_hash_name.
   */
  async highestBuyOrder(marketHashName: string, listingId?: string): Promise<number | null> {
    const id = listingId ?? (await this.lowestListing(marketHashName))?.id;
    if (!id) return null;
    const orders = unwrapList<CsfloatBuyOrder>(await this.get(`/listings/${id}/buy-orders?limit=10`));
    const prices = orders.map((o) => o.price).filter((p) => Number.isFinite(p));
    return prices.length ? Math.max(...prices) : null;
  }

  async me(): Promise<{ steam_id: string; username?: string }> {
    const res = await this.get<{ user?: { steam_id: string; username?: string } }>("/me");
    if (!res.user?.steam_id) throw new Error("Unexpected /me response from CSFloat");
    return res.user;
  }

  /** All trades (buys and sales) of the authenticated user, newest first. */
  async allTrades(maxPages = 50): Promise<CsfloatTrade[]> {
    const out: CsfloatTrade[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<unknown>(`/me/trades?limit=100&page=${page}`);
      const trades = unwrapList<CsfloatTrade>(res, "trades");
      out.push(...trades);
      if (trades.length < 100) break;
    }
    return out;
  }
}

let client: CsfloatClient | null = null;
export function getCsfloat(): CsfloatClient {
  client ??= new CsfloatClient(process.env.CSFLOAT_API_KEY ?? "");
  return client;
}
