import { items, PLATFORMS, transactions, TX_TYPES, type DB, type Item, type NewTransaction } from "@inv/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getCsfloat, type CsfloatTrade } from "./providers/csfloat";

/** API input: prices in dollars (as users type them), converted to cents on write. */
export const transactionInput = z.object({
  marketHashName: z.string().trim().min(1),
  type: z.enum(TX_TYPES),
  platform: z.enum(PLATFORMS),
  price: z.coerce.number().nonnegative(),
  fee: z.coerce.number().nonnegative().default(0),
  floatValue: z.coerce.number().min(0).max(1).nullish(),
  date: z.coerce.date(),
  itemId: z.coerce.number().int().positive().nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const toCents = (dollars: number) => Math.round(dollars * 100);

export function toRow(input: TransactionInput): NewTransaction {
  return {
    marketHashName: input.marketHashName,
    type: input.type,
    platform: input.platform,
    price: toCents(input.price),
    fee: toCents(input.fee),
    floatValue: input.floatValue ?? null,
    date: input.date,
    itemId: input.itemId ?? null,
    note: input.note ?? null,
  };
}

// ---------- CSV ----------

export const CSV_HEADER = "date,type,platform,market_hash_name,price,fee,float,note";

/** RFC4180-ish CSV parser (quoted fields, escaped quotes, CRLF, custom delimiter). */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Parses CSV in the {@link CSV_HEADER} format. Returns valid rows and per-line errors. */
export function parseTransactionsCsv(text: string) {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [] as TransactionInput[], errors: [{ line: 1, error: "Empty file" }] };
  const cols = header.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const rows: TransactionInput[] = [];
  const errors: { line: number; error: string }[] = [];

  lines.forEach((cells, i) => {
    const get = (name: string) => {
      const j = idx(name);
      const v = j >= 0 ? cells[j]?.trim() : undefined;
      return v === "" ? undefined : v;
    };
    const parsed = transactionInput.safeParse({
      date: get("date"),
      type: get("type")?.toLowerCase(),
      platform: get("platform")?.toLowerCase().replace(/[\s.]/g, ""),
      marketHashName: get("market_hash_name"),
      price: get("price"),
      fee: get("fee") ?? 0,
      floatValue: get("float"),
      note: get("note"),
    });
    if (parsed.success) rows.push(parsed.data);
    else errors.push({ line: i + 2, error: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
  });
  return { rows, errors };
}

// ---------- DMarket CSV export ----------

/** Header of DMarket's trade history export (semicolon-separated, decimal comma). */
const DMARKET_COLUMNS = ["type", "status", "title", "closed_at_utc", "price_api_units"];

export function isDmarketCsv(text: string) {
  const header = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0]!.toLowerCase().split(";");
  return DMARKET_COLUMNS.every((c) => header.includes(c));
}

/** "38,42" / "1.234,56" / "38.42" -> cents. */
const dmarketCents = (raw: string | undefined) => {
  if (!raw?.trim()) return 0;
  const s = raw.trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? toCents(n) : NaN;
};

/** Parses DMarket's trade history export. Only successful buys/sells are kept. */
export function parseDmarketCsv(text: string) {
  const [header, ...lines] = parseCsv(text.replace(/^\uFEFF/, ""), ";");
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const rows: NewTransaction[] = [];
  const errors: { line: number; error: string }[] = [];
  let skipped = 0;

  lines.forEach((cells, i) => {
    const get = (name: string) => cells[cols.indexOf(name)]?.trim() || undefined;
    if (!cells.some((c) => c.trim())) return;
    const type = get("type")?.toLowerCase();
    if (get("status")?.toLowerCase() !== "successful" || (type !== "buy" && type !== "sell")) return void skipped++;

    const name = get("title");
    const date = new Date(get("closed_at_utc") ?? "");
    const price = dmarketCents(get("price_api_units"));
    const fee = dmarketCents(get("fee_api_units"));
    if (!name || Number.isNaN(date.getTime()) || Number.isNaN(price) || Number.isNaN(fee)) {
      errors.push({ line: i + 2, error: "Missing or invalid title, closed_at_utc or price" });
      return;
    }
    const unlock = new Date(get("finalization_time_utc") ?? "");
    const offerId = get("offer_id");
    rows.push({
      externalId: offerId ? `dmarket:${type}:${offerId}` : null,
      marketHashName: name,
      type,
      platform: "dmarket",
      price,
      fee,
      floatValue: null,
      date,
      note: unlock.getTime() > date.getTime() ? `trade lock do ${unlock.toISOString().slice(0, 10)}` : null,
    });
  });
  return { rows, errors, skipped };
}

/** Imports either the generic {@link CSV_HEADER} format or a DMarket export. Re-importing a DMarket export skips duplicates. */
export async function importTransactionsCsv(db: DB, text: string) {
  const dmarket = isDmarketCsv(text);
  const { rows, errors } = dmarket
    ? parseDmarketCsv(text)
    : (({ rows, errors }) => ({ rows: rows.map(toRow), errors }))(parseTransactionsCsv(text));
  let inserted = 0;
  for (const row of rows) {
    const res = await db.insert(transactions).values(row).onConflictDoNothing({ target: transactions.externalId });
    inserted += res.rowsAffected;
  }
  const linked = inserted ? await linkTransactions(db) : null;
  return { format: dmarket ? "dmarket" : "generic", parsed: rows.length, inserted, errors, ...linked };
}

// ---------- CSFloat import ----------

const COMPLETED_STATES = new Set(["verified", "completed"]);

export function csfloatTradeToRow(trade: CsfloatTrade, mySteamId: string, sellFeePct: number): NewTransaction | null {
  if (!COMPLETED_STATES.has(trade.state)) return null;
  const isBuy = trade.buyer_id === mySteamId;
  if (!isBuy && trade.seller_id !== mySteamId) return null;
  const price = trade.contract.price;
  return {
    externalId: `csfloat:${trade.id}`,
    marketHashName: trade.contract.item.market_hash_name,
    type: isBuy ? "buy" : "sell",
    platform: "csfloat",
    price,
    fee: isBuy ? 0 : Math.round((price * sellFeePct) / 100),
    floatValue: trade.contract.item.float_value ?? null,
    date: new Date(trade.verified_at ?? trade.created_at),
  };
}

export async function importCsfloatTrades(db: DB) {
  const cf = getCsfloat();
  const me = await cf.me();
  const feePct = Number(process.env.CSFLOAT_SELL_FEE_PCT ?? 2);
  const trades = await cf.allTrades();
  const rows = trades.map((t) => csfloatTradeToRow(t, me.steam_id, feePct)).filter((r) => r !== null);
  let inserted = 0;
  for (const row of rows) {
    const res = await db.insert(transactions).values(row).onConflictDoNothing({ target: transactions.externalId });
    inserted += res.rowsAffected;
  }
  const linked = await linkTransactions(db);
  return { fetched: trades.length, completed: rows.length, inserted, ...linked };
}

// ---------- Linking transactions to items ----------

const FLOAT_EPS = 1e-7;
const sameFloat = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && Math.abs(a - b) < FLOAT_EPS;

/**
 * Attaches unlinked transactions to items. Steam asset ids change on every trade,
 * so matching uses name + float (when known), falling back to the oldest candidate.
 * Buys/sells with no matching inventory item get a placeholder item so their
 * P&L still shows up. Links can be corrected manually in the UI.
 */
export async function linkTransactions(db: DB) {
  let linkedBuys = 0;
  let linkedSells = 0;

  const allItems = await db.select().from(items).orderBy(asc(items.firstSeenAt));
  const allTx = await db.select().from(transactions).orderBy(asc(transactions.date));
  const hasBuy = new Set(allTx.filter((t) => t.type === "buy" && t.itemId).map((t) => t.itemId!));
  const hasSell = new Set(allTx.filter((t) => t.type === "sell" && t.itemId).map((t) => t.itemId!));
  const buyDate = new Map(allTx.filter((t) => t.type === "buy" && t.itemId).map((t) => [t.itemId!, t.date]));

  const placeholder = async (tx: (typeof allTx)[number], status: Item["status"]) => {
    const [created] = await db
      .insert(items)
      .values({ marketHashName: tx.marketHashName, floatValue: tx.floatValue, status, firstSeenAt: tx.date, lastSeenAt: tx.date })
      .returning();
    allItems.push(created!);
    return created!;
  };

  for (const tx of allTx.filter((t) => !t.itemId)) {
    const candidates = allItems.filter((i) => i.marketHashName === tx.marketHashName);
    let target: Item | undefined;

    if (tx.type === "buy") {
      const free = candidates.filter((i) => !hasBuy.has(i.id) && i.status !== "sold");
      target = free.find((i) => sameFloat(i.floatValue, tx.floatValue)) ?? free.find((i) => i.status === "held");
      target ??= await placeholder(tx, "gone");
      hasBuy.add(target.id);
      buyDate.set(target.id, tx.date);
      if (target.floatValue == null && tx.floatValue != null) {
        await db.update(items).set({ floatValue: tx.floatValue }).where(eq(items.id, target.id));
        target.floatValue = tx.floatValue;
      }
      linkedBuys++;
    } else {
      const free = candidates.filter(
        (i) => !hasSell.has(i.id) && i.status !== "sold" && (buyDate.get(i.id) ?? new Date(0)) <= tx.date,
      );
      target =
        free.find((i) => sameFloat(i.floatValue, tx.floatValue)) ??
        free.find((i) => i.status === "gone") ??
        free.find((i) => i.status === "held");
      target ??= await placeholder(tx, "sold");
      hasSell.add(target.id);
      await db.update(items).set({ status: "sold" }).where(eq(items.id, target.id));
      target.status = "sold";
      linkedSells++;
    }
    await db
      .update(transactions)
      .set({ itemId: target.id })
      .where(and(eq(transactions.id, tx.id), isNull(transactions.itemId)));
  }
  return { linkedBuys, linkedSells };
}
