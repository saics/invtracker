import { linkTransactions, syncInventory } from "@inv/core";
import { db, handler } from "@/lib/server";

export const POST = handler(async () => {
  const sync = await syncInventory(db());
  const linked = await linkTransactions(db());
  return { ...sync, ...linked };
});
