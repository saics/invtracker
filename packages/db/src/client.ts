import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/** Walks up from cwd to the folder containing pnpm-workspace.yaml. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Loads the repo-root .env once (no-op if missing or already loaded). */
export function loadRootEnv() {
  const g = globalThis as { __invEnvLoaded?: boolean };
  if (g.__invEnvLoaded) return;
  g.__invEnvLoaded = true;
  const file = join(findRepoRoot(), ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Relative `file:` URLs are resolved against the repo root so every package hits the same DB. */
function resolveDbUrl(raw: string | undefined): string {
  const url = raw?.trim() || "file:data/invtracker.db";
  if (!url.startsWith("file:")) return url;
  const path = url.slice("file:".length);
  const abs = isAbsolute(path) ? path : join(findRepoRoot(), path);
  mkdirSync(dirname(abs), { recursive: true });
  return `file:${abs}`;
}

function create() {
  loadRootEnv();
  const client = createClient({
    url: resolveDbUrl(process.env.DATABASE_URL),
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  return drizzle(client, { schema });
}

export type DB = ReturnType<typeof create>;

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  const g = globalThis as { __invDb?: DB };
  g.__invDb ??= create();
  return g.__invDb;
}
