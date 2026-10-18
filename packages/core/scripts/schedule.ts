import { getDb } from "@inv/db";
import cron from "node-cron";
import { syncInventory, updatePrices } from "../src";

const db = getDb();
const expr = process.env.PRICE_CRON || "0 */6 * * *";

async function run() {
  const started = new Date().toISOString();
  try {
    if (process.env.STEAM_ID) console.log(started, "inventory:", await syncInventory(db));
    const res = await updatePrices(db);
    console.log(started, `prices: ${res.done}/${res.total}, ${res.errors.length} errors`);
  } catch (e) {
    console.error(started, e);
  }
}

console.log(`Scheduler running (${expr}). Ctrl+C to stop.`);
cron.schedule(expr, run);
await run();
