import { getPortfolio } from "@inv/core";
import { db, handler, parseProvider } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const days = Number(new URL(req.url).searchParams.get("days") ?? 90);
  return getPortfolio(db(), parseProvider(req), Number.isFinite(days) ? Math.min(days, 3650) : 90);
});
