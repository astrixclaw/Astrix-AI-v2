/**
 * SQLite connection.
 *
 * We use better-sqlite3 because it's synchronous — there's no callback / promise
 * tangle, queries can't interleave half-finished, and for a household-scale app
 * it's plenty fast. The DB file lives next to the server unless overridden via
 * ASTRIX_HOME_DB.
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath =
  process.env.ASTRIX_HOME_DB ?? join(__dirname, "../../astrix-home.db");

export const db = new Database(dbPath);

// Foreign keys + WAL: WAL is faster + lets readers and a writer coexist.
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Apply the schema. CREATE TABLE IF NOT EXISTS makes this idempotent.
const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

console.log(`📂 SQLite ready at ${dbPath}`);
