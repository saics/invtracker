import { importCsfloatTrades } from "@inv/core";
import { db, handler } from "@/lib/server";

export const POST = handler(async () => importCsfloatTrades(db()));
