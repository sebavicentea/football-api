export interface Config {
  host: string;
  port: number;
  appToken: string;
  databasePath: string;
  promiedosBaseUrl: string;
  promiedosVersion: string;
  upstreamTimeoutMs: number;
  metadataCacheTtlMs: number;
  gamesCacheTtlMs: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadConfig(): Config {
  return {
    host: process.env.HOST?.trim() || "0.0.0.0",
    port: positiveInteger("PORT", 3001),
    appToken: required("APP_TOKEN"),
    databasePath: process.env.DATABASE_PATH?.trim() || "./data/football.db",
    promiedosBaseUrl: process.env.PROMIEDOS_BASE_URL?.trim() || "https://api.promiedos.com.ar",
    promiedosVersion: process.env.PROMIEDOS_VERSION?.trim() || "1.11.7.3",
    upstreamTimeoutMs: positiveInteger("UPSTREAM_TIMEOUT_MS", 15_000),
    metadataCacheTtlMs: positiveInteger("METADATA_CACHE_TTL_MS", 21_600_000),
    gamesCacheTtlMs: positiveInteger("GAMES_CACHE_TTL_MS", 604_800_000),
  };
}
