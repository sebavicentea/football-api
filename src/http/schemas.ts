import { Type, type Static, type TSchema } from "@sinclair/typebox";

const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const Id = Type.String({ minLength: 1 });
const LeagueId = Type.String({ minLength: 1 });
const Season = Type.Integer({ minimum: 1900, maximum: 2200 });
const StageType = Type.Union([
  Type.Literal("league"),
  Type.Literal("group"),
  Type.Literal("knockout"),
  Type.Literal("unknown"),
]);
const RoundPhase = Type.Union([
  Type.Literal("regular"),
  Type.Literal("round-of-16"),
  Type.Literal("quarter-final"),
  Type.Literal("semi-final"),
  Type.Literal("final"),
  Type.Literal("unknown"),
]);
const FixtureStatus = Type.Union([
  Type.Literal("NS"),
  Type.Literal("LIVE"),
  Type.Literal("FT"),
  Type.Literal("PST"),
  Type.Literal("CANC"),
  Type.Literal("SUSP"),
  Type.Literal("UNK"),
]);
export const StandingTableTypeSchema = Type.Union([
  Type.Literal("annual"),
  Type.Literal("stage"),
  Type.Literal("group"),
  Type.Literal("relegation-average"),
  Type.Literal("qualification"),
  Type.Literal("other"),
]);

const Stage = Type.Object({
  id: Id,
  name: Type.String(),
  type: StageType,
});

const Round = Type.Object({
  id: Id,
  name: Type.String(),
  stage: Stage,
  phase: RoundPhase,
  number: Nullable(Type.Integer()),
  order: Type.Integer({ minimum: 0 }),
  current: Type.Boolean(),
});

const Score = Type.Object({
  home: Nullable(Type.Integer()),
  away: Nullable(Type.Integer()),
});

const Team = Type.Object({
  id: Id,
  name: Type.String(),
  logo: Nullable(Type.String()),
  winner: Nullable(Type.Boolean()),
});

const Fixture = Type.Object({
  fixture: Type.Object({
    id: Id,
    timezone: Type.String(),
    date: Nullable(Type.String()),
    venue: Type.Object({
      id: Nullable(Type.String()),
      name: Nullable(Type.String()),
      city: Nullable(Type.String()),
    }),
    status: Type.Object({
      long: Type.String(),
      short: FixtureStatus,
      elapsed: Nullable(Type.Integer()),
      extra: Nullable(Type.Integer()),
    }),
  }),
  league: Type.Object({
    id: LeagueId,
    name: Type.String(),
    country: Type.String(),
    season: Season,
    stage: Stage,
    round: Type.Object({
      id: Id,
      name: Type.String(),
      number: Nullable(Type.Integer()),
      phase: RoundPhase,
    }),
  }),
  teams: Type.Object({ home: Team, away: Team }),
  goals: Score,
  score: Type.Object({
    halftime: Score,
    fulltime: Score,
    extratime: Score,
    penalty: Score,
  }),
});

const Qualification = Type.Object({
  type: Type.Union([
    Type.Literal("champion"),
    Type.Literal("continental"),
    Type.Literal("relegation"),
    Type.Literal("other"),
  ]),
  competitionId: Nullable(Type.Union([
    Type.Literal("conmebol-libertadores"),
    Type.Literal("conmebol-sudamericana"),
  ])),
  label: Type.String(),
});

const StandingRecord = Type.Object({
  played: Type.Integer(),
  win: Type.Integer(),
  draw: Type.Integer(),
  lose: Type.Integer(),
  goals: Score,
});

const StandingTable = Type.Object({
  id: Id,
  type: StandingTableTypeSchema,
  name: Type.String(),
  stage: Nullable(Stage),
  group: Nullable(Type.String()),
  standings: Type.Array(Type.Object({
    rank: Type.Integer(),
    team: Type.Object({
      id: Id,
      name: Type.String(),
      shortName: Nullable(Type.String()),
      logo: Nullable(Type.String()),
    }),
    points: Type.Integer(),
    goalsDiff: Nullable(Type.Integer()),
    description: Nullable(Type.String()),
    qualification: Type.Array(Qualification),
    all: StandingRecord,
    home: Nullable(StandingRecord),
    away: Nullable(StandingRecord),
  })),
});

const League = Type.Object({
  league: Type.Object({
    id: LeagueId,
    name: Type.String(),
    type: Type.Literal("League"),
    logo: Nullable(Type.String()),
  }),
  country: Type.Object({
    name: Type.String(),
    code: Type.String({ minLength: 2, maxLength: 3 }),
    flag: Nullable(Type.String()),
  }),
  seasons: Type.Array(Type.Object({
    year: Season,
    current: Type.Boolean(),
    coverage: Type.Object({
      rounds: Type.Boolean(),
      fixtures: Type.Boolean(),
      standings: Type.Boolean(),
    }),
  })),
});

const Meta = Type.Object({
  count: Type.Integer({ minimum: 0 }),
  generatedAt: Type.String(),
  league: Type.Optional(LeagueId),
  season: Type.Optional(Season),
  stale: Type.Optional(Type.Boolean()),
});

const Envelope = <T extends TSchema>(item: T) => Type.Object({
  data: Type.Array(item),
  meta: Meta,
});

export const LeagueResponseSchema = Envelope(League);
export const RoundResponseSchema = Envelope(Round);
export const FixtureResponseSchema = Envelope(Fixture);
export const StandingResponseSchema = Envelope(StandingTable);

export const ProblemSchema = Type.Object({
  type: Type.String(),
  title: Type.String(),
  status: Type.Integer(),
  detail: Type.String(),
  code: Type.String(),
  requestId: Type.String(),
});

export const LeagueQuerySchema = Type.Object({
  id: Type.Optional(Type.String()),
  season: Type.Optional(Season),
}, { additionalProperties: false });

export const SeasonQuerySchema = Type.Object({
  league: Type.String(),
  season: Season,
}, { additionalProperties: false });

export const FixtureQuerySchema = Type.Object({
  league: Type.String(),
  season: Season,
  round: Type.Optional(Type.String()),
  current: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

export const RemainingRegularFixtureQuerySchema = Type.Object({
  league: Type.String(),
  season: Season,
  stage: Id,
}, { additionalProperties: false });

export const StandingQuerySchema = Type.Object({
  league: Type.String(),
  season: Season,
  type: Type.Optional(StandingTableTypeSchema),
}, { additionalProperties: false });

export type LeagueQuery = Static<typeof LeagueQuerySchema>;
export type SeasonQuery = Static<typeof SeasonQuerySchema>;
export type FixtureQuery = Static<typeof FixtureQuerySchema>;
export type RemainingRegularFixtureQuery = Static<typeof RemainingRegularFixtureQuerySchema>;
export type StandingQuery = Static<typeof StandingQuerySchema>;
