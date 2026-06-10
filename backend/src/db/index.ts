/**
 * SQLite connection.
 *
 * We use better-sqlite3 because it's synchronous — there's no callback / promise
 * tangle, queries can't interleave half-finished, and for a household-scale app
 * it's plenty fast. The DB file lives next to the server unless overridden via
 * ASTRIX_HOME_DB.
 */
import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath =
  process.env.ASTRIX_HOME_DB ?? join(__dirname, "../../astrix-home.db");

export const db = new Database(dbPath);

// Foreign keys + WAL: WAL is faster + lets readers and a writer coexist.
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Apply the schema. CREATE TABLE IF NOT EXISTS makes this idempotent.
db.exec(SCHEMA_SQL);

console.log(`📂 SQLite ready at ${dbPath}`);
