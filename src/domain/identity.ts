export type EntityType =
  | "league"
  | "season"
  | "stage"
  | "round"
  | "fixture"
  | "team"
  | "standing-table";

export interface ProviderAlias {
  provider: string;
  entityType: EntityType;
  externalId: string;
  context: string;
}

export interface CanonicalAlias extends Omit<ProviderAlias, "externalId"> {
  canonicalId: string;
}

export interface IdentityRepository {
  resolveOrCreate(alias: ProviderAlias): string;
  findExternalId(alias: CanonicalAlias): string | null;
  bind(alias: ProviderAlias, canonicalId: string): void;
}
