import { readFileSync } from "node:fs";
import { getDb } from "@inv/db";
import { importSkinswapTransactions } from "../src";

const file = process.argv[2];
if (!file) throw new Error("Usage: pnpm skinswap:import <skinswap-transactions.json>");
const res = await importSkinswapTransactions(getDb(), JSON.parse(readFileSync(file, "utf8")));
console.log(res);
