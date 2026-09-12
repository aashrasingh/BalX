// db.js — connects to PostgreSQL (Supabase)
// ----------
// HOW IT WORKS (plain words):
//   - If DATABASE_URL is set (real Supabase), we create a real connection
//     pool so every request can talk to the database.
//   - If it's EMPTY (demo mode — no account yet), we don't try to connect.
//     The server detects this and uses in-memory demo data instead.
//
// The rest of the app imports `query()` from here. That way the routes
// never care whether we're on real Postgres or demo data — they just call
// query(sql, params) and get rows back.

import pg from "pg";
import { config, isDemoMode } from "./index.js";

// "Pool" = a box of ready-to-use connections. Faster than opening one
// new connection per request (like paying to open a shop door every time
// a customer walks in, instead of leaving it open).
let pool = null;

if (!isDemoMode) {
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  });

  // If the DB ever goes down, say so loudly instead of failing silently.
  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client:", err.message);
  });
}

/**
 * Run a query. Works in BOTH modes:
 *   - demo mode  -> handled by src/demo/store.js (no Postgres needed)
 *   - real mode  -> handled by the pg pool
 *
 * @param {string} text  SQL with $1, $2 placeholders
 * @param {any[]}  params values for those placeholders
 * @returns {Promise<{rows: any[]}>}
 */
export async function query(text, params = []) {
  if (isDemoMode) {
    const { demoQuery } = await import("../demo/store.js");
    return demoQuery(text, params);
  }
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release(); // give the connection back to the pool
  }
}

export async function runMigrations() {
  if (isDemoMode) return; // nothing to migrate in demo mode
  const fs = await import("node:fs");
  const sql = fs.readFileSync(
    new URL("../../schema.sql", import.meta.url),
    "utf8"
  );
  await pool.query(sql);
  console.log("[db] schema.sql applied ✓");
}

export function closePool() {
  if (pool) return pool.end();
}