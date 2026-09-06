import { describe, expect, it, vi } from "vitest";
import type {
  ProviderFixture,
  ProviderStandingTable,
} from "../src/application/provider.js";
import { TtlCache } from "../src/cache/ttl-cache.js";
import { PromiedosProvider } from "../src/providers/promiedos/provider.js";

const filters = [
  { name: "Partidos actuales", key: "latest" },
  { name: "Fecha 1", key: "72_228_3_1" },
  { name: "Final", key: "72_228_7_-1" },
  { name: "Fecha 1", key: "72_228_8_1" },
  { name: "Fecha 9", key: "72_228_8_9" },
];

const metadata = {
  TTL: 10,
  league: {
    id: "hc",
    name: "Liga Profesional Argentina",
    url_name: "liga-profesional",
    country_name: "Argentina",
  },
  games: { filters },
  tables_groups: [{
    name: "",
    tables: [{
      name: "Tabla Anual - Tabla Anual",
      table: {
        destinations: [{ num: 2, color: "#F5CB25", name: "CONMEBOL Libertadores" }],
        columns: [],
        rows: [{
          num: 2,
          values: [
            { key: "GamePlayed", value: "23" },
            { key: "Goals", value: "29:20" },
            { key: "Ratio", value: "9" },
            { key: "Points", value: "45" },
            { key: "GamesWon", value: "13" },
            { key: "GamesEven", value: "6" },
            { key: "GamesLost", value: "4" },
          ],
          entity: {
            type: 1,
            object: {
              id: "ihb",
              name: "Argentinos Juniors",
              short_name: "Argentinos",
              url_name: "argentinos-juniors",
            },
          },
          destination_color: "#F5CB25",
        }],
      },
    }],
  }],
};

const games = {
  TTL: 300,
  games: [{
    id: "egdddba",
    stage_round_name: "Fecha 9",
    winner: -1,
    teams: [
      { id: "ihh", name: "Newell's", short_name: "Newell's", url_name: "newells" },
      { id: "ihc", name: "Vélez", short_name: "Vélez", url_name: "velez" },
    ],
    status: { enum: 1, name: "Prog.", short_name: "Prog.", symbol_name: "Prog." },
    start_time: "11-09-2026 17:00",
    game_time: -1,
    game_time_to_display: "",
    game_time_status_to_display: "Prog.",
  }],
};

function createProvider(apiFetch = vi.fn<typeof fetch>(async (input) => {
  const path = new URL(input instanceof Request ? input.url : input).pathname;
  return Response.json(path.includes("tables_and_fixtures") ? metadata : games);
})) {
  return new PromiedosProvider({
    baseUrl: "https://provider.invalid",
    version: "1.11.7.3",
    timeoutMs: 1_000,
    metadataCacheTtlMs: 1_000,
    gamesCacheTtlMs: 1_000,
    apiFetch,
    cache: new TtlCache(),
  });
}

const competition = {
  externalLeagueId: "hc",
  season: 2026,
  timezone: "America/Argentina/Buenos_Aires",
};

describe("Promiedos provider adapter", () => {
  it("distinguishes duplicate Apertura and Clausura round numbers", async () => {
    const provider = createProvider();

    const result = await provider.listRounds(competition);

    expect(result.data).toHaveLength(4);
    expect(result.data[0]).toMatchObject({
      externalId: "72_228_3_1",
      stageExternalId: "apertura",
      number: 1,
    });
    expect(result.data[2]).toMatchObject({
      externalId: "72_228_8_1",
      stageExternalId: "clausura",
      number: 1,
    });
  });

  it("normalizes fixtures without exposing provider image URLs", async () => {
    const apiFetch = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      return Response.json(path.includes("tables_and_fixtures") ? metadata : games);
    });
    const provider = createProvider(apiFetch);

    const result = await provider.listFixtures(competition, "72_228_8_9");

    expect(result.data[0]).toMatchObject({
      date: "2026-09-11T17:00:00-03:00",
      status: { short: "NS" },
      home: { name: "Newell's", logo: null },
      away: { name: "Vélez", logo: null },
    });
    expect(apiFetch.mock.calls[0]?.[1]?.headers).toEqual({ "X-VER": "1.11.7.3" });
  });

  it("normalizes annual standings and canonical qualification meaning", async () => {
    const provider = createProvider();

    const result = await provider.listStandingTables(competition, "annual");

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      type: "annual",
      name: "Tabla Anual",
      standings: [{
        rank: 2,
        points: 45,
        goalsFor: 29,
        goalsAgainst: 20,
        qualifications: [{
          type: "continental",
          competitionId: "conmebol-libertadores",
        }],
      }],
    });
    expect(JSON.stringify(result.data)).not.toContain("#F5CB25");
  });

  it("assigns each current fixture its own round", async () => {
    const mixedGames = {
      ...games,
      games: [
        games.games[0],
        { ...games.games[0], id: "final-game", stage_round_name: "Final" },
      ],
    };
    const provider = createProvider(vi.fn<typeof fetch>(async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      return Response.json(path.includes("tables_and_fixtures") ? metadata : mixedGames);
    }));

    const result = await provider.listCurrentFixtures(competition);

    expect(result.data.map((fixture: ProviderFixture) => fixture.round.externalId)).toEqual([
      "72_228_8_9",
      "72_228_7_-1",
    ]);
  });

  it("keeps same-named group tables distinct across stages", async () => {
    const baseTable = metadata.tables_groups[0]!.tables[0]!;
    const groupedMetadata = {
      ...metadata,
      tables_groups: [
        { name: "Apertura", tables: [{ ...baseTable, name: "Zona A" }] },
        { name: "Clausura", tables: [{ ...baseTable, name: "Zona A" }] },
      ],
    };
    const provider = createProvider(vi.fn<typeof fetch>(async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      return Response.json(path.includes("tables_and_fixtures") ? groupedMetadata : games);
    }));

    const result = await provider.listStandingTables(competition, "group");

    expect(result.data.map((table: ProviderStandingTable) => ({
      externalId: table.externalId,
      stageName: table.stageName,
      group: table.group,
    }))).toEqual([
      { externalId: "Apertura:0:Zona A", stageName: "Apertura", group: "Zona A" },
      { externalId: "Clausura:0:Zona A", stageName: "Clausura", group: "Zona A" },
    ]);
  });

  it("rejects structurally invalid upstream responses", async () => {
    const provider = createProvider(vi.fn<typeof fetch>(async () => Response.json({})));

    await expect(provider.listRounds(competition)).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
