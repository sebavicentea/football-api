import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { FootballCatalog } from "../src/application/catalog.js";
import type { FootballDataProvider } from "../src/application/provider.js";
import { buildApp } from "../src/app.js";
import { SqliteIdentityRepository } from "../src/persistence/sqlite/identity-repository.js";

let app: FastifyInstance | undefined;
let identities: SqliteIdentityRepository | undefined;

afterEach(async () => {
  await app?.close();
  identities?.close();
  app = undefined;
  identities = undefined;
});

function createCatalog(provider: FootballDataProvider, now: () => Date = () => new Date()) {
  if (!identities) throw new Error("Identity repository is not initialized.");
  return new FootballCatalog([{
    leagueId: "argentina-lpf",
    leagueName: "Liga Profesional de Fútbol",
    country: { name: "Argentina", code: "AR" },
    season: 2026,
    current: true,
    timezone: "America/Argentina/Buenos_Aires",
    externalLeagueId: "hc",
    provider,
  }], identities, now);
}

function createProvider(): FootballDataProvider {
  const round = {
    externalId: "72_228_8_9",
    stageExternalId: "clausura",
    stageName: "Clausura",
    stageType: "league" as const,
    name: "Fecha 9",
    phase: "regular" as const,
    number: 9,
    order: 20,
    current: true,
  };
  const fixture = {
    externalId: "game-1",
    round,
    date: "2026-09-11T17:00:00-03:00",
    timezone: "America/Argentina/Buenos_Aires",
    status: { long: "Programado", short: "NS" as const, elapsed: null, extra: null },
    home: {
      externalId: "river",
      name: "River Plate",
      shortName: "River",
      logo: null,
      winner: null,
      goals: null,
    },
    away: {
      externalId: "velez",
      name: "Vélez Sarsfield",
      shortName: "Vélez",
      logo: null,
      winner: null,
      goals: null,
    },
  };
  return {
    name: "promiedos",
    listRounds: vi.fn(async () => ({ data: [round], stale: false })),
    listFixtures: vi.fn(async () => ({ stale: false, data: [fixture] })),
    listCurrentFixtures: vi.fn(async () => ({ data: [], stale: false })),
    listRemainingRegularFixtures: vi.fn(async () => ({ stale: false, data: [fixture] })),
    listStandingTables: vi.fn(async () => ({
      stale: false,
      data: [{
        externalId: "Tabla Anual - Tabla Anual",
        type: "annual" as const,
        name: "Tabla Anual",
        stage: null,
        stageName: null,
        group: null,
        standings: [{
          rank: 1,
          team: {
            externalId: "river",
            name: "River Plate",
            shortName: "River",
            logo: null,
          },
          played: 10,
          win: 7,
          draw: 2,
          lose: 1,
          goalsFor: 20,
          goalsAgainst: 8,
          goalsDiff: 12,
          points: 23,
          qualifications: [{
            type: "continental" as const,
            competitionId: "conmebol-libertadores" as const,
            label: "CONMEBOL Libertadores",
          }],
        }],
      }],
    })), 
  };
}

describe("football routes", () => {
  it("discovers a canonical round ID and uses it to query fixtures", async () => {
    const provider = createProvider();
    identities = new SqliteIdentityRepository(":memory:");
    app = await buildApp({
      appToken: "test-token",
      catalog: createCatalog(provider, () => new Date("2026-09-06T12:00:00Z")),
    });
    const headers = { authorization: "Bearer test-token" };

    const roundsResponse = await app.inject({
      method: "GET",
      url: "/v1/fixtures/rounds?league=argentina-lpf&season=2026",
      headers,
    });
    const round = roundsResponse.json().data[0];
    const fixturesResponse = await app.inject({
      method: "GET",
      url: `/v1/fixtures?league=argentina-lpf&season=2026&round=${round.id}`,
      headers,
    });

    expect(roundsResponse.statusCode).toBe(200);
    expect(round).toMatchObject({
      name: "Fecha 9",
      stage: { name: "Clausura" },
    });
    expect(round.id).toMatch(/^rnd_/);
    expect(round.id).not.toContain("72_228_8_9");
    expect(fixturesResponse.statusCode).toBe(200);
    expect(fixturesResponse.json().data[0]).toMatchObject({
      fixture: { timezone: "America/Argentina/Buenos_Aires" },
      teams: {
        home: { name: "River Plate" },
        away: { name: "Vélez Sarsfield" },
      },
    });
    expect(provider.listFixtures).toHaveBeenCalledWith({
      externalLeagueId: "hc",
      season: 2026,
      timezone: "America/Argentina/Buenos_Aires",
    }, "72_228_8_9");
  });

  it("discovers a canonical stage ID and lists remaining regular fixtures", async () => {
    const provider = createProvider();
    identities = new SqliteIdentityRepository(":memory:");
    app = await buildApp({
      appToken: "test-token",
      catalog: createCatalog(provider, () => new Date("2026-09-06T12:00:00Z")),
    });
    const headers = { authorization: "Bearer test-token" };

    const roundsResponse = await app.inject({
      method: "GET",
      url: "/v1/fixtures/rounds?league=argentina-lpf&season=2026",
      headers,
    });
    const stage = roundsResponse.json().data[0].stage;
    const fixturesResponse = await app.inject({
      method: "GET",
      url: `/v1/fixtures/remaining-regular?league=argentina-lpf&season=2026&stage=${stage.id}`,
      headers,
    });

    expect(roundsResponse.statusCode).toBe(200);
    expect(stage).toMatchObject({ name: "Clausura", type: "league" });
    expect(stage.id).toMatch(/^stg_/);
    expect(fixturesResponse.statusCode).toBe(200);
    expect(fixturesResponse.json().data[0]).toMatchObject({
      fixture: { id: expect.stringMatching(/^fix_/) },
      teams: {
        home: { id: expect.stringMatching(/^tea_/), name: "River Plate" },
        away: { id: expect.stringMatching(/^tea_/), name: "Vélez Sarsfield" },
      },
    });
    expect(provider.listRemainingRegularFixtures).toHaveBeenCalledWith({
      externalLeagueId: "hc",
      season: 2026,
      timezone: "America/Argentina/Buenos_Aires",
    }, "clausura");
  });

  it("returns annual standings without provider aliases or presentation colors", async () => {
    const provider = createProvider();
    identities = new SqliteIdentityRepository(":memory:");
    app = await buildApp({
      appToken: "test-token",
      catalog: createCatalog(provider, () => new Date("2026-09-06T12:00:00Z")),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/standings?league=argentina-lpf&season=2026&type=annual",
      headers: { authorization: "Bearer test-token" },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: expect.stringMatching(/^tbl_/),
      type: "annual",
      standings: [{
        team: { id: expect.stringMatching(/^tea_/), name: "River Plate" },
        qualification: [{ competitionId: "conmebol-libertadores" }],
      }],
    });
    expect(JSON.stringify(body)).not.toContain("Tabla Anual - Tabla Anual");
    expect(JSON.stringify(body)).not.toContain("promiedos");
  });

  it("returns Problem Details for an unknown canonical round", async () => {
    const provider = createProvider();
    identities = new SqliteIdentityRepository(":memory:");
    app = await buildApp({
      appToken: "test-token",
      catalog: createCatalog(provider),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/fixtures?league=argentina-lpf&season=2026&round=rnd_unknown",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      code: "ROUND_NOT_FOUND",
      title: "Round not found",
    });
  });

  it("returns Problem Details for an unknown canonical stage", async () => {
    const provider = createProvider();
    identities = new SqliteIdentityRepository(":memory:");
    app = await buildApp({
      appToken: "test-token",
      catalog: createCatalog(provider),
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/fixtures/remaining-regular?league=argentina-lpf&season=2026&stage=stg_unknown",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      code: "STAGE_NOT_FOUND",
      title: "Stage not found",
    });
  });
});
