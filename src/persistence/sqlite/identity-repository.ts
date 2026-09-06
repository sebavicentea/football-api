import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type {
  CanonicalAlias,
  EntityType,
  IdentityRepository,
  ProviderAlias,
} from "../../domain/identity.js";

const prefixes: Record<EntityType, string> = {
  league: "lea",
  season: "sea",
  stage: "stg",
  round: "rnd",
  fixture: "fix",
  team: "tea",
  "standing-table": "tbl",
};

interface AliasRow {
  canonical_id: string;
}

interface ExternalIdRow {
  external_id: string;
}

export class SqliteIdentityRepository implements IdentityRepository {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.migrate();
  }

  resolveOrCreate(alias: ProviderAlias): string {
    return this.database.transaction(() => {
      const existing = this.findCanonicalId(alias);
      if (existing) return existing;

      const canonicalId = `${prefixes[alias.entityType]}_${randomUUID()}`;
      this.database.prepare(
        "INSERT INTO canonical_entities (id, entity_type) VALUES (?, ?)",
      ).run(canonicalId, alias.entityType);
      this.insertAlias(alias, canonicalId);
      return canonicalId;
    })();
  }

  findExternalId(alias: CanonicalAlias): string | null {
    const row = this.database.prepare(`
      SELECT external_id
      FROM provider_aliases
      WHERE provider = ? AND entity_type = ? AND canonical_id = ? AND context = ?
    `).get(
      alias.provider,
      alias.entityType,
      alias.canonicalId,
      alias.context,
    ) as ExternalIdRow | undefined;
    return row?.external_id ?? null;
  }

  bind(alias: ProviderAlias, canonicalId: string): void {
    const entity = this.database.prepare(
      "SELECT id FROM canonical_entities WHERE id = ? AND entity_type = ?",
    ).get(canonicalId, alias.entityType);
    if (!entity) throw new Error("Canonical entity does not exist or has a different type.");
    this.insertAlias(alias, canonicalId);
  }

  close(): void {
    this.database.close();
  }

  private findCanonicalId(alias: ProviderAlias): string | null {
    const row = this.database.prepare(`
      SELECT canonical_id
      FROM provider_aliases
      WHERE provider = ? AND entity_type = ? AND external_id = ? AND context = ?
    `).get(
      alias.provider,
      alias.entityType,
      alias.externalId,
      alias.context,
    ) as AliasRow | undefined;
    return row?.canonical_id ?? null;
  }

  private insertAlias(alias: ProviderAlias, canonicalId: string): void {
    this.database.prepare(`
      INSERT INTO provider_aliases (
        provider, entity_type, external_id, context, canonical_id
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      alias.provider,
      alias.entityType,
      alias.externalId,
      alias.context,
      canonicalId,
    );
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS canonical_entities (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS provider_aliases (
        provider TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        external_id TEXT NOT NULL,
        context TEXT NOT NULL,
        canonical_id TEXT NOT NULL REFERENCES canonical_entities(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (provider, entity_type, external_id, context),
        UNIQUE (provider, entity_type, canonical_id, context)
      );
    `);
  }
}
