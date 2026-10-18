import { getInventoryView } from "@inv/core";
import { ITEM_STATUSES } from "@inv/db";
import { db, handler, parseProvider } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const status = new URL(req.url).searchParams.get("status");
  const rows = await getInventoryView(db(), parseProvider(req));
  return (ITEM_STATUSES as readonly string[]).includes(status ?? "") ? rows.filter((r) => r.status === status) : rows;
});
