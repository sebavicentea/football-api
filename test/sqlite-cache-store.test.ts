import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCacheStore } from "../src/persistence/sqlite/cache-store.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite cache store", () => {
  it("keeps values and expiries across reopen and overwrites on upsert", () => {
    const directory = mkdtempSync(join(tmpdir(), "football-cache-"));
    directories.push(directory);
    const databasePath = join(directory, "cache.db");

    const store = new SqliteCacheStore(databasePath);
    store.set("promiedos:games:hc:x", { value: { games: [1] }, expiresAt: 1234 });
    store.set("promiedos:games:hc:x", { value: { games: [1, 2] }, expiresAt: 5678 });
    store.close();

    const reopened = new SqliteCacheStore(databasePath);
    expect(reopened.get("promiedos:games:hc:x")).toEqual({
      value: { games: [1, 2] },
      expiresAt: 5678,
    });
    expect(reopened.get("missing")).toBeUndefined();
    reopened.close();
  });

  it("treats invalid JSON as a cache miss without deleting the row", () => {
    const directory = mkdtempSync(join(tmpdir(), "football-cache-"));
    directories.push(directory);
    const databasePath = join(directory, "cache.db");

    const store = new SqliteCacheStore(databasePath);
    store.close();
    const database = new Database(databasePath);
    database.prepare(
      "INSERT INTO provider_cache_entries (cache_key, value_json, expires_at) VALUES (?, ?, ?)",
    ).run("broken", "{not-json", 9999);
    database.close();

    const reopened = new SqliteCacheStore(databasePath);
    expect(reopened.get("broken")).toBeUndefined();
    reopened.set("broken", { value: "recovered", expiresAt: 1 });
    expect(reopened.get("broken")).toEqual({ value: "recovered", expiresAt: 1 });
    reopened.close();
  });
});
