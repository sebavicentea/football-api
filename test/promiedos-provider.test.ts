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

function game(id: string, status: { enum: number; name: string; short_name: string }) {
  return {
    ...games.games[0]!,
    id,
    status: { ...games.games[0]!.status, ...status },
  };
}

function fetchByRound(byRound: Record<string, unknown[]>) {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    if (path.includes("tables_and_fixtures")) return Response.json(metadata);
    const key = decodeURIComponent(path.split("/").pop() ?? "");
    return Response.json({ TTL: 300, games: byRound[key] ?? [] });
  });
}

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

  it("lists only unfinished regular fixtures for the requested stage", async () => {
    const apiFetch = fetchByRound({
      "72_228_8_1": [
        game("g-ns", { enum: 1, name: "Prog.", short_name: "Prog." }),
        game("g-pst", { enum: 1, name: "Postergado", short_name: "Post." }),
        game("g-live", { enum: 2, name: "En juego", short_name: "Live" }),
        game("g-ft", { enum: 3, name: "Finalizado", short_name: "Fin." }),
        game("g-canc", { enum: 1, name: "Cancelado", short_name: "Canc." }),
      ],
      "72_228_8_9": [
        game("g-susp", { enum: 2, name: "Suspendido", short_name: "Susp." }),
        game("g-unk", { enum: 9, name: "Reprogramando", short_name: "Rep." }),
        game("g-ns", { enum: 1, name: "Prog.", short_name: "Prog." }),
      ],
    });
    const provider = createProvider(apiFetch);

    const result = await provider.listRemainingRegularFixtures(competition, "clausura");

    expect(result.stale).toBe(false);
    expect(result.data.map((fixture) => [fixture.externalId, fixture.status.short, fixture.round.externalId]))
      .toEqual([
        ["g-ns", "NS", "72_228_8_1"],
        ["g-pst", "PST", "72_228_8_1"],
        ["g-live", "LIVE", "72_228_8_1"],
        ["g-susp", "SUSP", "72_228_8_9"],
        ["g-unk", "UNK", "72_228_8_9"],
      ]);
    const fetchedRounds = apiFetch.mock.calls
      .map(([input]) => new URL(input instanceof Request ? input.url : input).pathname)
      .filter((path) => path.includes("/league/games/"))
      .map((path) => decodeURIComponent(path.split("/").pop() ?? ""));
    expect(fetchedRounds).toEqual(["72_228_8_1", "72_228_8_9"]);
  });

  it("scopes remaining fixtures to the stage and skips non-regular rounds", async () => {
    const apiFetch = fetchByRound({
      "72_228_3_1": [game("g-apertura", { enum: 1, name: "Prog.", short_name: "Prog." })],
      "72_228_7_-1": [game("g-final", { enum: 1, name: "Prog.", short_name: "Prog." })],
    });
    const provider = createProvider(apiFetch);

    const result = await provider.listRemainingRegularFixtures(competition, "apertura");

    expect(result.data.map((fixture) => fixture.externalId)).toEqual(["g-apertura"]);
    expect(result.data[0]).toMatchObject({ round: { stageExternalId: "apertura" } });
    expect(apiFetch.mock.calls.map(([input]) =>
      new URL(input instanceof Request ? input.url : input).pathname,
    ).join(" ")).not.toContain("72_228_7_-1");
  });

  it("bounds round-game requests to four in flight and keeps round order", async () => {
    const manyRoundsMetadata = {
      ...metadata,
      games: {
        filters: [
          { name: "Partidos actuales", key: "latest" },
          { name: "Final", key: "final_apertura" },
          ...Array.from({ length: 7 }, (_, index) => ({
            name: `Fecha ${index + 1}`,
            key: `c${index + 1}`,
          })),
        ],
      },
    };
    let inFlight = 0;
    let peak = 0;
    const apiFetch = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.includes("tables_and_fixtures")) return Response.json(manyRoundsMetadata);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      const key = decodeURIComponent(path.split("/").pop() ?? "");
      return Response.json({
        TTL: 300,
        games: [game(`g-${key}`, { enum: 1, name: "Prog.", short_name: "Prog." })],
      });
    });
    const provider = createProvider(apiFetch);

    const result = await provider.listRemainingRegularFixtures(competition, "clausura");

    expect(peak).toBe(4);
    expect(result.data.map((fixture) => fixture.externalId))
      .toEqual(["g-c1", "g-c2", "g-c3", "g-c4", "g-c5", "g-c6", "g-c7"]);
  });

  it("propagates stale from cached metadata or round games", async () => {
    let now = 0;
    let fail = false;
    const apiFetch = vi.fn<typeof fetch>(async (input) => {
      if (fail) throw new Error("upstream down");
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.includes("tables_and_fixtures")) return Response.json(metadata);
      return Response.json({
        TTL: 300,
        games: [game("g-1", { enum: 1, name: "Prog.", short_name: "Prog." })],
      });
    });
    const provider = new PromiedosProvider({
      baseUrl: "https://provider.invalid",
      version: "1.11.7.3",
      timeoutMs: 1_000,
      metadataCacheTtlMs: 1_000,
      gamesCacheTtlMs: 1_000,
      apiFetch,
      cache: new TtlCache(() => now),
    });

    const fresh = await provider.listRemainingRegularFixtures(competition, "clausura");
    expect(fresh.stale).toBe(false);

    now = 2_000;
    fail = true;
    const stale = await provider.listRemainingRegularFixtures(competition, "clausura");
    expect(stale.stale).toBe(true);
  });

  it("serves the last good round when a refresh returns an empty payload", async () => {
    let now = 0;
    let empty = false;
    const apiFetch = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path.includes("tables_and_fixtures")) return Response.json(metadata);
      return Response.json({
        TTL: 300,
        games: empty
          ? []
          : [game("g-good", { enum: 1, name: "Prog.", short_name: "Prog." })],
      });
    });
    const provider = new PromiedosProvider({
      baseUrl: "https://provider.invalid",
      version: "1.11.7.3",
      timeoutMs: 1_000,
      metadataCacheTtlMs: 1_000,
      gamesCacheTtlMs: 1_000,
      apiFetch,
      cache: new TtlCache(() => now),
    });

    const fresh = await provider.listRemainingRegularFixtures(competition, "clausura");
    expect(fresh.stale).toBe(false);
    expect(fresh.data.map((fixture) => fixture.externalId)).toEqual(["g-good"]);

    now = 2_000;
    empty = true;
    const stale = await provider.listRemainingRegularFixtures(competition, "clausura");
    expect(stale.stale).toBe(true);
    expect(stale.data.map((fixture) => fixture.externalId)).toEqual(["g-good"]);
  });

  it("rejects structurally invalid upstream responses", async () => {
    const provider = createProvider(vi.fn<typeof fetch>(async () => Response.json({})));

    await expect(provider.listRounds(competition)).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
});
