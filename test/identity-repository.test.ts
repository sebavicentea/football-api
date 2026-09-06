import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteIdentityRepository } from "../src/persistence/sqlite/identity-repository.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical identity registry", () => {
  it("keeps a provider alias mapped to the same canonical ID after reopening", () => {
    const directory = mkdtempSync(join(tmpdir(), "football-identity-"));
    directories.push(directory);
    const databasePath = join(directory, "identity.db");
    const alias = {
      provider: "promiedos",
      entityType: "round" as const,
      externalId: "72_228_8_9",
      context: "argentina-lpf:2026",
    };

    const firstRepository = new SqliteIdentityRepository(databasePath);
    const firstId = firstRepository.resolveOrCreate(alias);
    firstRepository.close();

    const reopenedRepository = new SqliteIdentityRepository(databasePath);
    expect(reopenedRepository.resolveOrCreate(alias)).toBe(firstId);
    expect(reopenedRepository.findExternalId({
      provider: "promiedos",
      entityType: "round",
      canonicalId: firstId,
      context: "argentina-lpf:2026",
    })).toBe("72_228_8_9");
    reopenedRepository.close();
  });

  it("binds a second provider alias to an existing canonical entity", () => {
    const repository = new SqliteIdentityRepository(":memory:");
    const canonicalId = repository.resolveOrCreate({
      provider: "promiedos",
      entityType: "team",
      externalId: "igi",
      context: "football",
    });
    const secondAlias = {
      provider: "api-football",
      entityType: "team" as const,
      externalId: "435",
      context: "football",
    };

    repository.bind(secondAlias, canonicalId);

    expect(repository.resolveOrCreate(secondAlias)).toBe(canonicalId);
    repository.close();
  });
});
