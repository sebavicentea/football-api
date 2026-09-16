import type {
  ApiMeta,
  FixtureDto,
  LeagueDto,
  RoundDto,
  StandingTableDto,
  StandingTableType,
  StageSummary,
} from "../domain/football.js";
import type { IdentityRepository } from "../domain/identity.js";
import { ApplicationError } from "./errors.js";
import type {
  FootballDataProvider,
  ProviderCompetition,
  ProviderFixture,
  ProviderResult,
  ProviderRound,
  ProviderStandingTable,
  ProviderTeam,
} from "./provider.js";

export interface LeagueCoverage {
  leagueId: string;
  leagueName: string;
  country: {
    name: string;
    code: string;
  };
  season: number;
  current: boolean;
  timezone: string;
  externalLeagueId: string;
  provider: FootballDataProvider;
}

export class FootballCatalog {
  constructor(
    private readonly coverages: LeagueCoverage[],
    private readonly identities: IdentityRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listLeagues(league?: string, season?: number): { data: LeagueDto[]; meta: ApiMeta } {
    const selected = this.coverages.filter(
      (coverage) => (!league || coverage.leagueId === league) && (!season || coverage.season === season),
    );
    const leagues = new Map<string, LeagueDto>();
    for (const coverage of selected) {
      const existing = leagues.get(coverage.leagueId);
      const seasonDto = {
        year: coverage.season,
        current: coverage.current,
        coverage: { rounds: true, fixtures: true, standings: true },
      };
      if (existing) {
        existing.seasons.push(seasonDto);
      } else {
        leagues.set(coverage.leagueId, {
          league: {
            id: coverage.leagueId,
            name: coverage.leagueName,
            type: "League",
            logo: null,
          },
          country: {
            name: coverage.country.name,
            code: coverage.country.code,
            flag: null,
          },
          seasons: [seasonDto],
        });
      }
    }
    const data = [...leagues.values()];
    return { data, meta: this.meta(data.length) };
  }

  async listRounds(league: string, season: number) {
    const coverage = this.coverage(league, season);
    const result = await coverage.provider.listRounds(this.providerCompetition(coverage));
    const data = result.data.map((round) => this.round(coverage, round));
    return { data, meta: this.meta(data.length, coverage, result.stale) };
  }

  async listFixtures(
    league: string,
    season: number,
    selection: { round?: string; current?: boolean },
  ) {
    const coverage = this.coverage(league, season);
    let result: ProviderResult<ProviderFixture[]>;
    if (selection.current) {
      result = await coverage.provider.listCurrentFixtures(this.providerCompetition(coverage));
    } else if (selection.round) {
      const externalId = this.identities.findExternalId({
        provider: coverage.provider.name,
        entityType: "round",
        canonicalId: selection.round,
        context: this.seasonContext(coverage),
      });
      if (!externalId) {
        throw new ApplicationError(404, "ROUND_NOT_FOUND", "Round not found", "The requested round does not exist in this season.");
      }
      result = await coverage.provider.listFixtures(
        this.providerCompetition(coverage),
        externalId,
      );
    } else {
      throw new ApplicationError(400, "INVALID_QUERY", "Invalid query", "Use either round or current=true.");
    }

    const data = result.data.map((fixture) => this.fixture(coverage, fixture));
    return { data, meta: this.meta(data.length, coverage, result.stale) };
  }

  async listRemainingRegularFixtures(
    league: string,
    season: number,
    canonicalStageId: string,
  ) {
    const coverage = this.coverage(league, season);
    const externalId = this.identities.findExternalId({
      provider: coverage.provider.name,
      entityType: "stage",
      canonicalId: canonicalStageId,
      context: this.seasonContext(coverage),
    });
    if (!externalId) {
      throw new ApplicationError(404, "STAGE_NOT_FOUND", "Stage not found", "The requested stage does not exist in this season.");
    }
    const result = await coverage.provider.listRemainingRegularFixtures(
      this.providerCompetition(coverage),
      externalId,
    );
    const data = result.data.map((fixture) => this.fixture(coverage, fixture));
    return { data, meta: this.meta(data.length, coverage, result.stale) };
  }

  async listStandingTables(
    league: string,
    season: number,
    type?: StandingTableType,
  ) {
    const coverage = this.coverage(league, season);
    const result = await coverage.provider.listStandingTables(
      this.providerCompetition(coverage),
      type,
    );
    const data = result.data.map((table) => this.standingTable(coverage, table));
    return { data, meta: this.meta(data.length, coverage, result.stale) };
  }

  private coverage(league: string, season: number): LeagueCoverage {
    const leagueCoverages = this.coverages.filter((coverage) => coverage.leagueId === league);
    if (leagueCoverages.length === 0) {
      throw new ApplicationError(404, "LEAGUE_NOT_FOUND", "League not found", "The requested league is not available.");
    }
    const coverage = leagueCoverages.find((candidate) => candidate.season === season);
    if (!coverage) {
      throw new ApplicationError(422, "UNSUPPORTED_SEASON", "Unsupported season", "The requested season is not available for this league.");
    }
    return coverage;
  }

  private round(coverage: LeagueCoverage, round: ProviderRound): RoundDto {
    return {
      id: this.identity(coverage, "round", round.externalId, this.seasonContext(coverage)),
      name: round.name,
      stage: this.stage(coverage, round.stageExternalId, round.stageName, round.stageType),
      phase: round.phase,
      number: round.number,
      order: round.order,
      current: round.current,
    };
  }

  private fixture(coverage: LeagueCoverage, candidate: ProviderFixture): FixtureDto {
    const round = this.round(coverage, candidate.round);
    const home = this.team(coverage, candidate.home);
    const away = this.team(coverage, candidate.away);
    const emptyScore = { home: null, away: null };
    const goals = { home: candidate.home.goals, away: candidate.away.goals };

    return {
      fixture: {
        id: this.identity(coverage, "fixture", candidate.externalId, this.seasonContext(coverage)),
        timezone: candidate.timezone,
        date: candidate.date,
        venue: { id: null, name: null, city: null },
        status: candidate.status,
      },
      league: {
        id: coverage.leagueId,
        name: coverage.leagueName,
        country: coverage.country.name,
        season: coverage.season,
        stage: round.stage,
        round: {
          id: round.id,
          name: round.name,
          number: round.number,
          phase: round.phase,
        },
      },
      teams: {
        home: { id: home.id, name: home.name, logo: home.logo, winner: candidate.home.winner },
        away: { id: away.id, name: away.name, logo: away.logo, winner: candidate.away.winner },
      },
      goals,
      score: {
        halftime: emptyScore,
        fulltime: candidate.status.short === "FT" ? goals : emptyScore,
        extratime: emptyScore,
        penalty: emptyScore,
      },
    };
  }

  private standingTable(
    coverage: LeagueCoverage,
    candidate: ProviderStandingTable,
  ): StandingTableDto {
    return {
      id: this.identity(
        coverage,
        "standing-table",
        candidate.externalId,
        this.seasonContext(coverage),
      ),
      type: candidate.type,
      name: candidate.name,
      stage: candidate.stage && candidate.stageName
        ? this.stage(coverage, candidate.stage, candidate.stageName, "league")
        : null,
      group: candidate.group,
      standings: candidate.standings.map((row) => ({
        rank: row.rank,
        team: this.team(coverage, row.team),
        points: row.points,
        goalsDiff: row.goalsDiff,
        description: row.qualifications[0]?.label ?? null,
        qualification: row.qualifications,
        all: {
          played: row.played,
          win: row.win,
          draw: row.draw,
          lose: row.lose,
          goals: { home: row.goalsFor, away: row.goalsAgainst },
        },
        home: null,
        away: null,
      })),
    };
  }

  private team(coverage: LeagueCoverage, team: ProviderTeam) {
    return {
      id: this.identity(coverage, "team", team.externalId, "football"),
      name: team.name,
      shortName: team.shortName,
      logo: team.logo,
    };
  }

  private stage(
    coverage: LeagueCoverage,
    externalId: string,
    name: string,
    type: StageSummary["type"],
  ): StageSummary {
    return {
      id: this.identity(coverage, "stage", externalId, this.seasonContext(coverage)),
      name,
      type,
    };
  }

  private identity(
    coverage: LeagueCoverage,
    entityType: "stage" | "round" | "fixture" | "team" | "standing-table",
    externalId: string,
    context: string,
  ): string {
    return this.identities.resolveOrCreate({
      provider: coverage.provider.name,
      entityType,
      externalId,
      context,
    });
  }

  private providerCompetition(coverage: LeagueCoverage): ProviderCompetition {
    return {
      externalLeagueId: coverage.externalLeagueId,
      season: coverage.season,
      timezone: coverage.timezone,
    };
  }

  private seasonContext(coverage: LeagueCoverage): string {
    return `${coverage.leagueId}:${coverage.season}`;
  }

  private meta(count: number, coverage?: LeagueCoverage, stale = false): ApiMeta {
    return {
      count,
      generatedAt: this.now().toISOString(),
      ...(coverage ? { league: coverage.leagueId, season: coverage.season } : {}),
      stale,
    };
  }
}
