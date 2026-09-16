import { Type, type Static } from "@sinclair/typebox";

const TeamSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  short_name: Type.String(),
  url_name: Type.String(),
});

export const MetadataSchema = Type.Object({
  TTL: Type.Number(),
  league: Type.Object({
    id: Type.String(),
    name: Type.String(),
    url_name: Type.String(),
    country_name: Type.String(),
  }),
  games: Type.Object({
    filters: Type.Array(Type.Object({
      name: Type.String(),
      key: Type.String(),
      selected: Type.Optional(Type.Boolean()),
    })),
  }),
  tables_groups: Type.Array(Type.Object({
    name: Type.String(),
    tables: Type.Array(Type.Object({
      name: Type.String(),
      table: Type.Object({
        destinations: Type.Array(Type.Object({
          num: Type.Number(),
          color: Type.String(),
          name: Type.String(),
        })),
        columns: Type.Array(Type.Object({
          key: Type.String(),
          title: Type.String(),
        })),
        rows: Type.Array(Type.Object({
          num: Type.Number(),
          values: Type.Array(Type.Object({
            key: Type.String(),
            value: Type.Union([Type.String(), Type.Array(Type.Unknown())]),
          })),
          entity: Type.Object({
            type: Type.Number(),
            object: TeamSchema,
          }),
          destination_color: Type.Optional(Type.String()),
        })),
      }),
    })),
  })),
});

export const GamesSchema = Type.Object({
  TTL: Type.Number(),
  games: Type.Array(Type.Object({
    id: Type.String(),
    stage_round_name: Type.String(),
    winner: Type.Number(),
    teams: Type.Tuple([TeamSchema, TeamSchema]),
    scores: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    status: Type.Object({
      enum: Type.Number(),
      name: Type.String(),
      short_name: Type.String(),
      symbol_name: Type.String(),
    }),
    start_time: Type.String(),
    game_time: Type.Number(),
    game_time_to_display: Type.String(),
    game_time_status_to_display: Type.String(),
  })),
});

export type PromiedosMetadata = Static<typeof MetadataSchema>;
export type PromiedosGames = Static<typeof GamesSchema>;
export type PromiedosGame = PromiedosGames["games"][number];
export type PromiedosTable = PromiedosMetadata["tables_groups"][number]["tables"][number];
