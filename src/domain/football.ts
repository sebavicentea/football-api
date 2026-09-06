export const LEAGUE_ID = "argentina-lpf";
export const LEAGUE_NAME = "Liga Profesional de Fútbol";
export const LEAGUE_SEASON = 2026;
export const LEAGUE_TIMEZONE = "America/Argentina/Buenos_Aires";

export type StageType = "league" | "group" | "knockout" | "unknown";
export type RoundPhase =
  | "regular"
  | "round-of-16"
  | "quarter-final"
  | "semi-final"
  | "final"
  | "unknown";
export type FixtureStatus =
  | "NS"
  | "LIVE"
  | "FT"
  | "PST"
  | "CANC"
  | "SUSP"
  | "UNK";
export type StandingTableType =
  | "annual"
  | "stage"
  | "group"
  | "relegation-average"
  | "qualification"
  | "other";

export interface StageSummary {
  id: string;
  name: string;
  type: StageType;
}

export interface RoundDto {
  id: string;
  name: string;
  stage: StageSummary;
  phase: RoundPhase;
  number: number | null;
  order: number;
  current: boolean;
}

export interface ScorePair {
  home: number | null;
  away: number | null;
}

export interface FixtureDto {
  fixture: {
    id: string;
    timezone: string;
    date: string | null;
    venue: {
      id: string | null;
      name: string | null;
      city: string | null;
    };
    status: {
      long: string;
      short: FixtureStatus;
      elapsed: number | null;
      extra: number | null;
    };
  };
  league: {
    id: string;
    name: string;
    country: string;
    season: number;
    stage: StageSummary;
    round: {
      id: string;
      name: string;
      number: number | null;
      phase: RoundPhase;
    };
  };
  teams: {
    home: TeamSide;
    away: TeamSide;
  };
  goals: ScorePair;
  score: {
    halftime: ScorePair;
    fulltime: ScorePair;
    extratime: ScorePair;
    penalty: ScorePair;
  };
}

export interface TeamSide {
  id: string;
  name: string;
  logo: string | null;
  winner: boolean | null;
}

export interface StandingRecord {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals: ScorePair;
}

export interface Qualification {
  type: "champion" | "continental" | "relegation" | "other";
  competitionId: "conmebol-libertadores" | "conmebol-sudamericana" | null;
  label: string;
}

export interface StandingRow {
  rank: number;
  team: {
    id: string;
    name: string;
    shortName: string | null;
    logo: string | null;
  };
  points: number;
  goalsDiff: number | null;
  description: string | null;
  qualification: Qualification[];
  all: StandingRecord;
  home: StandingRecord | null;
  away: StandingRecord | null;
}

export interface StandingTableDto {
  id: string;
  type: StandingTableType;
  name: string;
  stage: StageSummary | null;
  group: string | null;
  standings: StandingRow[];
}

export interface LeagueDto {
  league: {
    id: string;
    name: string;
    type: "League";
    logo: string | null;
  };
  country: {
    name: string;
    code: string;
    flag: string | null;
  };
  seasons: Array<{
    year: number;
    current: boolean;
    coverage: {
      rounds: boolean;
      fixtures: boolean;
      standings: boolean;
    };
  }>;
}

export interface ApiMeta {
  count: number;
  generatedAt: string;
  league?: string;
  season?: number;
  stale?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}
