import { getDb } from "@inv/db";
import { DEFAULT_PRICE_CRON, startAutoRefresh } from "../src";

// The web dev server already does this (see apps/web/src/instrumentation.ts); this script is
// for running the refresher on its own, e.g. next to `pnpm start` with AUTO_REFRESH=0.
await startAutoRefresh(getDb(), { staleAfterMs: 0 });
console.log(`Scheduler running (${process.env.PRICE_CRON || DEFAULT_PRICE_CRON}). Ctrl+C to stop.`);
