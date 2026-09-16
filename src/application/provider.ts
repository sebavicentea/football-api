import type {
  FixtureStatus,
  Qualification,
  RoundPhase,
  StageType,
  StandingTableType,
} from "../domain/football.js";

export interface ProviderRound {
  externalId: string;
  stageExternalId: string;
  stageName: string;
  stageType: StageType;
  name: string;
  phase: RoundPhase;
  number: number | null;
  order: number;
  current: boolean;
}

export interface ProviderTeam {
  externalId: string;
  name: string;
  shortName: string | null;
  logo: string | null;
}

export interface ProviderFixture {
  externalId: string;
  round: ProviderRound;
  date: string | null;
  timezone: string;
  status: {
    long: string;
    short: FixtureStatus;
    elapsed: number | null;
    extra: number | null;
  };
  home: ProviderTeam & {
    winner: boolean | null;
    goals: number | null;
  };
  away: ProviderTeam & {
    winner: boolean | null;
    goals: number | null;
  };
}

export interface ProviderStandingRow {
  rank: number;
  team: ProviderTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalsDiff: number | null;
  points: number;
  qualifications: Qualification[];
}

export interface ProviderStandingTable {
  externalId: string;
  type: StandingTableType;
  name: string;
  stage: ProviderRound["stageExternalId"] | null;
  stageName: string | null;
  group: string | null;
  standings: ProviderStandingRow[];
}

export interface ProviderResult<T> {
  data: T;
  stale: boolean;
}

export interface ProviderCompetition {
  externalLeagueId: string;
  season: number;
  timezone: string;
}

export class ProviderError extends Error {
  constructor(readonly code: "unavailable" | "invalid-response", message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface FootballDataProvider {
  readonly name: string;
  listRounds(competition: ProviderCompetition): Promise<ProviderResult<ProviderRound[]>>;
  listFixtures(competition: ProviderCompetition, roundExternalId: string): Promise<ProviderResult<ProviderFixture[]>>;
  listCurrentFixtures(competition: ProviderCompetition): Promise<ProviderResult<ProviderFixture[]>>;
  listRemainingRegularFixtures(
    competition: ProviderCompetition,
    stageExternalId: string,
  ): Promise<ProviderResult<ProviderFixture[]>>;
  listStandingTables(competition: ProviderCompetition, type?: StandingTableType): Promise<ProviderResult<ProviderStandingTable[]>>;
}
