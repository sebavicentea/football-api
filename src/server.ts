import { FootballCatalog } from "./application/catalog.js";
import { buildApp } from "./app.js";
import { TtlCache } from "./cache/ttl-cache.js";
import { loadConfig } from "./config.js";
import {
  LEAGUE_ID,
  LEAGUE_NAME,
  LEAGUE_SEASON,
  LEAGUE_TIMEZONE,
} from "./domain/football.js";
import { SqliteIdentityRepository } from "./persistence/sqlite/identity-repository.js";
import { PromiedosProvider } from "./providers/promiedos/provider.js";

const config = loadConfig();
const identities = new SqliteIdentityRepository(config.databasePath);
const provider = new PromiedosProvider({
  baseUrl: config.promiedosBaseUrl,
  version: config.promiedosVersion,
  timeoutMs: config.upstreamTimeoutMs,
  metadataCacheTtlMs: config.metadataCacheTtlMs,
  gamesCacheTtlMs: config.gamesCacheTtlMs,
  apiFetch: fetch,
  cache: new TtlCache(),
});
const app = await buildApp({
  appToken: config.appToken,
  catalog: new FootballCatalog([{
    leagueId: LEAGUE_ID,
    leagueName: LEAGUE_NAME,
    country: { name: "Argentina", code: "AR" },
    season: LEAGUE_SEASON,
    current: true,
    timezone: LEAGUE_TIMEZONE,
    externalLeagueId: "hc",
    provider,
  }], identities),
  logger: true,
});

await app.listen({ host: config.host, port: config.port });

async function shutdown() {
  await app.close();
  identities.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
