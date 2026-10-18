import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

await migrate(getDb(), { migrationsFolder });
console.log("Database migrated.");
