// src/services/batchInsert.js
// ----------
// WHY THIS EXISTS (plain words):
//   Inserting sample data one row at a time (400+ separate `await query()`
//   calls) means 400+ round trips to the database — each one has real
//   network latency, especially against a real Supabase/Postgres server.
//   That can turn a "seed the database" step into a very slow, seemingly
//   stuck-feeling first server start.
//
//   This bundles many rows into ONE multi-row INSERT statement (in safe
//   chunks), turning hundreds of round trips into a small handful.

import { query } from "../config/db.js";

/**
 * @param {string} table - table name
 * @param {string[]} columns - column names, in order
 * @param {object[]} rows - plain objects with those exact keys
 * @param {string} [conflictClause] - e.g. "ON CONFLICT (a,b) DO NOTHING" (optional)
 * @param {number} [chunkSize] - rows per INSERT statement (Postgres has a
 *   65535 parameter limit per query, so this stays well under that)
 */
export async function batchInsert(table, columns, rows, conflictClause = "", chunkSize = 500) {
  if (rows.length === 0) return;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const placeholdersForRow = columns.map((col, colIndex) => {
        values.push(row[col]);
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${placeholdersForRow.join(",")})`;
    });

    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")} ${conflictClause}`;
    await query(sql, values);
  }
}
