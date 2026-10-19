import { getDb } from "@inv/db";
import { csfloatEnabled, updatePrices } from "../src";

const db = getDb();
console.log(`Updating prices (Skinport${csfloatEnabled() ? " + CSFloat" : ""})…`);
const res = await updatePrices(db);
console.log(`Done: ${res.done}/${res.total} items, ${res.errors.length} errors.`);
for (const e of res.errors) console.warn(`  ${e.name}: ${e.error}`);
