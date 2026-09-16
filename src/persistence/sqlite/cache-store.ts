import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { CacheEntry, CacheStore } from "../../cache/ttl-cache.js";

interface CacheRow {
  value_json: string;
  expires_at: number;
}

export class SqliteCacheStore implements CacheStore {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS provider_cache_entries (
        cache_key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
    `);
  }

  get(key: string): CacheEntry<unknown> | undefined {
    const row = this.database.prepare(`
      SELECT value_json, expires_at
      FROM provider_cache_entries
      WHERE cache_key = ?
    `).get(key) as CacheRow | undefined;
    if (!row) return undefined;
    try {
      return { value: JSON.parse(row.value_json), expiresAt: row.expires_at };
    } catch {
      return undefined;
    }
  }

  set(key: string, entry: CacheEntry<unknown>): void {
    this.database.prepare(`
      INSERT INTO provider_cache_entries (cache_key, value_json, expires_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (cache_key) DO UPDATE SET
        value_json = excluded.value_json,
        expires_at = excluded.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(entry.value), entry.expiresAt);
  }

  close(): void {
    this.database.close();
  }
}
