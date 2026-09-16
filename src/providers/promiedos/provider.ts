import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import {
  ProviderError,
  type FootballDataProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderResult,
  type ProviderRound,
  type ProviderStandingTable,
} from "../../application/provider.js";
import type {
  FixtureStatus,
  Qualification,
  RoundPhase,
  StandingTableType,
} from "../../domain/football.js";
import type { TtlCache } from "../../cache/ttl-cache.js";
import {
  GamesSchema,
  MetadataSchema,
  type PromiedosGame,
  type PromiedosMetadata,
  type PromiedosTable,
} from "./raw-schemas.js";

type ApiFetch = typeof fetch;

export interface PromiedosProviderOptions {
  baseUrl: string;
  version: string;
  timeoutMs: number;
  metadataCacheTtlMs: number;
  gamesCacheTtlMs: number;
  apiFetch: ApiFetch;
  cache: TtlCache;
}

export class PromiedosProvider implements FootballDataProvider {
  readonly name = "promiedos";

  constructor(private readonly options: PromiedosProviderOptions) {}

  async listRounds(competition: ProviderCompetition): Promise<ProviderResult<ProviderRound[]>> {
    const [metadata, games] = await Promise.all([
      this.metadata(competition),
      this.games(competition, "latest"),
    ]);
    const rounds = normalizeRounds(metadata.value.games.filters);
    for (const label of new Set(games.value.games.map((game) => game.stage_round_name))) {
      const current = rounds.findLast((round) => round.name === label);
      if (current) current.current = true;
    }
    return { data: rounds, stale: metadata.stale || games.stale };
  }

  async listFixtures(
    competition: ProviderCompetition,
    roundExternalId: string,
  ): Promise<ProviderResult<ProviderFixture[]>> {
    const [metadata, games] = await Promise.all([
      this.metadata(competition),
      this.games(competition, roundExternalId),
    ]);
    const round = normalizeRounds(metadata.value.games.filters)
      .find((candidate) => candidate.externalId === roundExternalId);
    if (!round) throw new ProviderError("invalid-response", "Unknown provider round alias.");
    return {
      data: games.value.games.map((game) => normalizeFixture(game, round, competition.timezone)),
      stale: metadata.stale || games.stale,
    };
  }

  async listCurrentFixtures(competition: ProviderCompetition): Promise<ProviderResult<ProviderFixture[]>> {
    const [rounds, games] = await Promise.all([
      this.listRounds(competition),
      this.games(competition, "latest"),
    ]);
    return {
      data: games.value.games.map((game) => normalizeFixture(
        game,
        resolveCurrentRound(game.stage_round_name, rounds.data),
        competition.timezone,
      )),
      stale: rounds.stale || games.stale,
    };
  }

  async listRemainingRegularFixtures(
    competition: ProviderCompetition,
    stageExternalId: string,
  ): Promise<ProviderResult<ProviderFixture[]>> {
    const metadata = await this.metadata(competition);
    const rounds = normalizeRounds(metadata.value.games.filters)
      .filter((round) => round.stageExternalId === stageExternalId && round.phase === "regular");
    const results: Awaited<ReturnType<PromiedosProvider["games"]>>[] = [];
    for (let index = 0; index < rounds.length; index += 4) {
      results.push(...await Promise.all(
        rounds.slice(index, index + 4).map((round) => this.games(competition, round.externalId)),
      ));
    }
    const seen = new Set<string>();
    const data: ProviderFixture[] = [];
    let stale = metadata.stale;
    results.forEach((result, index) => {
      stale = stale || result.stale;
      const round = rounds[index]!;
      for (const game of result.value.games) {
        const status = statusFromGame(game);
        if (status === "FT" || status === "CANC") continue;
        if (seen.has(game.id)) continue;
        seen.add(game.id);
        data.push(normalizeFixture(game, round, competition.timezone));
      }
    });
    return { data, stale };
  }

  async listStandingTables(
    competition: ProviderCompetition,
    type?: StandingTableType,
  ): Promise<ProviderResult<ProviderStandingTable[]>> {
    const metadata = await this.metadata(competition);
    const tables = metadata.value.tables_groups.flatMap((group) => group.tables.map(
      (table, index) => ({ table, stageName: group.name, index }),
    )).filter(({ table }) => !type || tableType(table.name) === type)
      .map(({ table, stageName, index }) => normalizeTable(table, stageName, index));
    return { data: tables, stale: metadata.stale };
  }

  private metadata(competition: ProviderCompetition) {
    const league = competition.externalLeagueId;
    return this.options.cache.getOrLoad(
      `promiedos:snapshot:${league}`,
      Math.min(this.options.metadataCacheTtlMs, this.options.gamesCacheTtlMs),
      () => this.request(`/league/tables_and_fixtures/${encodeURIComponent(league)}`, MetadataSchema),
    );
  }

  private games(competition: ProviderCompetition, round: string) {
    const league = competition.externalLeagueId;
    return this.options.cache.getOrLoad(
      `promiedos:games:${league}:${round}`,
      this.options.gamesCacheTtlMs,
      () => this.request(`/league/games/${encodeURIComponent(league)}/${encodeURIComponent(round)}`, GamesSchema),
    );
  }

  private async request<T extends TSchema>(path: string, schema: T): Promise<Static<T>> {
    let response: Response;
    try {
      const baseUrl = this.options.baseUrl.endsWith("/")
        ? this.options.baseUrl
        : `${this.options.baseUrl}/`;
      response = await this.options.apiFetch(new URL(path.replace(/^\//, ""), baseUrl), {
        headers: { "X-VER": this.options.version },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      throw new ProviderError("unavailable", "The football data provider is unavailable.");
    }
    if (!response.ok) {
      throw new ProviderError("unavailable", `The football data provider returned ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderError("invalid-response", "The football data provider returned invalid JSON.");
    }
    if (!Value.Check(schema, payload)) {
      throw new ProviderError("invalid-response", "The football data provider response did not match its expected structure.");
    }
    return payload;
  }
}

function normalizeRounds(filters: PromiedosMetadata["games"]["filters"]): ProviderRound[] {
  let stageExternalId = "apertura";
  let apertureFinished = false;

  return filters.flatMap((filter, index) => {
    if (filter.key === "latest") return [];
    if (apertureFinished && /^fecha\s+1$/i.test(filter.name)) stageExternalId = "clausura";
    const phase = phaseFromLabel(filter.name);
    if (stageExternalId === "apertura" && phase === "final") apertureFinished = true;
    return [{
      externalId: filter.key,
      stageExternalId,
      stageName: stageExternalId === "apertura" ? "Apertura" : "Clausura",
      stageType: phase === "regular" ? "league" : "knockout",
      name: filter.name,
      phase,
      number: numberFromLabel(filter.name),
      order: index,
      current: false,
    }];
  });
}

function resolveCurrentRound(label: string, rounds: ProviderRound[]): ProviderRound {
  const matched = rounds.findLast((round) => round.name === label);
  return matched ?? {
    externalId: `latest:${label}`,
    stageExternalId: "current",
    stageName: "Current",
    stageType: "unknown",
    name: label || "Current fixtures",
    phase: phaseFromLabel(label),
    number: numberFromLabel(label),
    order: rounds.length,
    current: true,
  };
}

function phaseFromLabel(label: string): RoundPhase {
  const normalized = label.toLowerCase();
  if (/round of 16|8th finals|octavos/.test(normalized)) return "round-of-16";
  if (/quarter|cuartos/.test(normalized)) return "quarter-final";
  if (/semi|semifinal/.test(normalized)) return "semi-final";
  if (/(^|\s|-)(final)(\s|$)/.test(normalized)) return "final";
  if (/\d/.test(normalized)) return "regular";
  return "unknown";
}

function numberFromLabel(label: string): number | null {
  const value = label.match(/(?:^|\s|-)(\d+)\s*$/)?.[1];
  return value ? Number(value) : null;
}

function statusFromGame(game: PromiedosGame): FixtureStatus {
  const label = `${game.status.name} ${game.status.short_name}`.toLowerCase();
  if (/posterg|aplaz/.test(label)) return "PST";
  if (/cancel/.test(label)) return "CANC";
  if (/suspend|interrump|aband/.test(label)) return "SUSP";
  if (game.status.enum === 1) return "NS";
  if (game.status.enum === 2) return "LIVE";
  if (game.status.enum === 3) return "FT";
  return "UNK";
}

function normalizeDate(value: string): string | null {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00-03:00`;
}

function normalizeFixture(
  game: PromiedosGame,
  round: ProviderRound,
  timezone: string,
): ProviderFixture {
  const status = statusFromGame(game);
  const homeGoals = game.scores?.[0] ?? null;
  const awayGoals = game.scores?.[1] ?? null;
  return {
    externalId: game.id,
    round,
    date: normalizeDate(game.start_time),
    timezone,
    status: {
      long: game.status.name,
      short: status,
      elapsed: status === "LIVE" && game.game_time >= 0 ? game.game_time : null,
      extra: null,
    },
    home: {
      externalId: game.teams[0].id,
      name: game.teams[0].name,
      shortName: game.teams[0].short_name,
      logo: null,
      winner: game.winner === 1 ? true : game.winner === 2 ? false : null,
      goals: homeGoals,
    },
    away: {
      externalId: game.teams[1].id,
      name: game.teams[1].name,
      shortName: game.teams[1].short_name,
      logo: null,
      winner: game.winner === 2 ? true : game.winner === 1 ? false : null,
      goals: awayGoals,
    },
  };
}

function normalizeTable(
  table: PromiedosTable,
  stageName: string,
  tableIndex: number,
): ProviderStandingTable {
  const type = tableType(table.name);
  const qualifications = table.table.destinations.map((destination) => ({
    color: destination.color.toLowerCase(),
    qualification: qualificationFromLabel(destination.name),
  }));
  return {
    externalId: `${stageName || "season"}:${tableIndex}:${table.name}`,
    type,
    name: type === "annual" ? "Tabla Anual" : table.name,
    stage: stageName ? stageName.toLowerCase() : null,
    stageName: stageName || null,
    group: type === "group" ? table.name : null,
    standings: table.table.rows.map((row) => {
      const goalsValue = row.values.find((entry) => entry.key === "Goals")?.value;
      const goals = typeof goalsValue === "string" ? goalsValue.match(/^(\d+):(\d+)$/) : null;
      if (goalsValue !== undefined && !goals) {
        throw new ProviderError("invalid-response", "A standing row has invalid goals.");
      }
      const qualification = row.destination_color
        ? qualifications.find((entry) => entry.color === row.destination_color?.toLowerCase())?.qualification
        : undefined;
      return {
        rank: row.num,
        team: {
          externalId: row.entity.object.id,
          name: row.entity.object.name,
          shortName: row.entity.object.short_name,
          logo: null,
        },
        played: rowNumber(row.values, "GamePlayed"),
        win: rowNumber(row.values, "GamesWon"),
        draw: rowNumber(row.values, "GamesEven"),
        lose: rowNumber(row.values, "GamesLost"),
        goalsFor: goals ? Number(goals[1]) : null,
        goalsAgainst: goals ? Number(goals[2]) : null,
        goalsDiff: rowOptionalNumber(row.values, "Ratio"),
        points: rowNumber(row.values, "Points"),
        qualifications: qualification ? [qualification] : [],
      };
    }),
  };
}

function tableType(name: string): StandingTableType {
  const normalized = name.toLowerCase();
  if (normalized.includes("tabla anual")) return "annual";
  if (normalized.includes("promedio")) return "relegation-average";
  if (/zona|grupo|group/.test(normalized)) return "group";
  return "other";
}

function qualificationFromLabel(label: string): Qualification {
  const normalized = label.toLowerCase();
  if (normalized.includes("campeón")) return { type: "champion", competitionId: null, label };
  if (normalized.includes("libertadores")) {
    return { type: "continental", competitionId: "conmebol-libertadores", label };
  }
  if (normalized.includes("sudamericana")) {
    return { type: "continental", competitionId: "conmebol-sudamericana", label };
  }
  if (normalized.includes("descenso")) return { type: "relegation", competitionId: null, label };
  return { type: "other", competitionId: null, label };
}

function rowOptionalNumber(
  values: Array<{ key: string; value: unknown }>,
  key: string,
): number | null {
  const value = values.find((entry) => entry.key === key)?.value;
  if (value === undefined) return null;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new ProviderError("invalid-response", `A standing row has invalid ${key}.`);
  }
  return parsed;
}

function rowNumber(values: Array<{ key: string; value: unknown }>, key: string): number {
  const value = values.find((entry) => entry.key === key)?.value;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new ProviderError("invalid-response", `A standing row has invalid ${key}.`);
  }
  return parsed;
}
