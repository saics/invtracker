import type { DB } from "@inv/db";
import cron, { type ScheduledTask } from "node-cron";
import { syncInventory } from "./inventory";
import { getPriceJob, lastPriceUpdate, updatePrices } from "./prices";

export const DEFAULT_PRICE_CRON = "0 */2 * * *";

/** Inventory sync (when STEAM_ID is set) followed by a full price update. Never throws. */
export async function runScheduledUpdate(db: DB, log: (msg: string) => void = console.log) {
  const started = new Date().toISOString();
  try {
    if (getPriceJob().running) return log(`${started} prices: update already running, skipped`);
    if (process.env.STEAM_ID) log(`${started} inventory: ${JSON.stringify(await syncInventory(db))}`);
    const res = await updatePrices(db);
    log(`${started} prices: ${res.done}/${res.total}, ${res.errors.length} errors`);
  } catch (e) {
    console.error(started, e);
  }
}

const g = globalThis as { __invAutoRefresh?: ScheduledTask };

/**
 * Runs `runScheduledUpdate` on PRICE_CRON, plus once at startup when the newest
 * snapshot is older than `staleAfterMs`. Safe to call repeatedly (dev hot reloads).
 */
export async function startAutoRefresh(db: DB, { staleAfterMs = 60 * 60_000 } = {}) {
  if (g.__invAutoRefresh) return;
  const expr = process.env.PRICE_CRON || DEFAULT_PRICE_CRON;
  g.__invAutoRefresh = cron.schedule(expr, () => runScheduledUpdate(db), { noOverlap: true });
  const last = await lastPriceUpdate(db);
  console.log(`[prices] auto-refresh on "${expr}", last update ${last?.toISOString() ?? "never"}`);
  if (!last || Date.now() - last.getTime() > staleAfterMs) void runScheduledUpdate(db);
}

/** When the in-process auto-refresh runs next (null when it is not running in this process). */
export const nextScheduledRun = (): Date | null => g.__invAutoRefresh?.getNextRun() ?? null;
