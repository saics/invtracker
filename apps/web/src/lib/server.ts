import { getDb, loadRootEnv } from "@inv/db";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Secrets live in the repo-root .env (shared with the CLI scripts).
loadRootEnv();

export const db = () => getDb();

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
