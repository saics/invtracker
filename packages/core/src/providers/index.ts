import type { PriceProvider } from "@inv/db";
import { getCsfloat } from "./csfloat";
import { steamPrice } from "./steam";

export const PROVIDER_LABELS: Record<PriceProvider, string> = {
  csfloat_listing: "CSFloat (lowest listing)",
  csfloat_buyorder: "CSFloat (buy order)",
  steam: "Steam Market",
};

/**
 * Fetches prices for one item from the requested providers. The CSFloat listing
 * lookup is shared with the buy-order lookup to save a request.
 */
export async function fetchPrices(
  marketHashName: string,
  providers: PriceProvider[],
): Promise<Partial<Record<PriceProvider, number | null>>> {
  const out: Partial<Record<PriceProvider, number | null>> = {};
  const wantsCsfloat = providers.includes("csfloat_listing") || providers.includes("csfloat_buyorder");

  if (wantsCsfloat) {
    const cf = getCsfloat();
    const listing = await cf.lowestListing(marketHashName);
    if (providers.includes("csfloat_listing")) out.csfloat_listing = listing?.price ?? null;
    if (providers.includes("csfloat_buyorder")) {
      out.csfloat_buyorder = listing ? await cf.highestBuyOrder(marketHashName, listing.id) : null;
    }
  }
  if (providers.includes("steam")) out.steam = await steamPrice(marketHashName);
  return out;
}

export { CsfloatClient, getCsfloat } from "./csfloat";
export { parseSteamPrice, steamPrice } from "./steam";
