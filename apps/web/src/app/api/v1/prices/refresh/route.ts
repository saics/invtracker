import { getPriceJob, startPriceUpdate } from "@inv/core";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Starts a background price update for all held items. Poll GET for progress. */
export const POST = handler(async () => startPriceUpdate(db()));

export const GET = handler(async () => getPriceJob());
