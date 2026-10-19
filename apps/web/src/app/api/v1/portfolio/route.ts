import { getPortfolio } from "@inv/core";
import { db, handler } from "@/lib/server";

export const dynamic = "force-dynamic";

/** `?days=90` history length; `?ids=1,2,3` limits everything to those items (inventory filters). */
export const GET = handler(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const days = Number(params.get("days") ?? 90);
  const ids = params.get("ids")?.split(",").map(Number).filter(Number.isInteger);
  return getPortfolio(db(), Number.isFinite(days) ? Math.min(days, 3650) : 90, ids);
});
