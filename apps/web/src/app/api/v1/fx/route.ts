import { getUsdEurRate } from "@inv/core";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async () => getUsdEurRate(db()));
