import { getDb, loadRootEnv, PRICE_PROVIDERS, type PriceProvider } from "@inv/db";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Secrets live in the repo-root .env (shared with the CLI scripts).
loadRootEnv();

export const db = () => getDb();

export function parseProvider(req: Request): PriceProvider {
  const p = new URL(req.url).searchParams.get("provider");
  return (PRICE_PROVIDERS as readonly string[]).includes(p ?? "") ? (p as PriceProvider) : "csfloat_listing";
}

/** Wraps a route handler with uniform JSON error responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
      }
      const message = e instanceof Error ? e.message : String(e);
      console.error(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
