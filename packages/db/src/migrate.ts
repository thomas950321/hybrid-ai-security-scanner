import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getPool, closePool } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const migrationPath = resolve(__dirname, "..", "migrations", "0001_init.sql");
  const sql = readFileSync(migrationPath, "utf8");

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log("Migration 0001_init applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await closePool();
  }
}

main();
