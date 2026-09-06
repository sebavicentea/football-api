import type { FastifyInstance } from "fastify";
import type { FootballCatalog } from "../application/catalog.js";
import { ApplicationError } from "../application/errors.js";
import {
  FixtureQuerySchema,
  FixtureResponseSchema,
  LeagueQuerySchema,
  LeagueResponseSchema,
  ProblemSchema,
  RoundResponseSchema,
  SeasonQuerySchema,
  StandingQuerySchema,
  StandingResponseSchema,
  type FixtureQuery,
  type LeagueQuery,
  type SeasonQuery,
  type StandingQuery,
} from "./schemas.js";

const errorResponses = {
  400: ProblemSchema,
  401: ProblemSchema,
  404: ProblemSchema,
  422: ProblemSchema,
  502: ProblemSchema,
  503: ProblemSchema,
};

export function registerFootballRoutes(app: FastifyInstance, catalog: FootballCatalog): void {
  app.get<{ Querystring: LeagueQuery }>("/v1/leagues", {
    schema: {
      security: [{ bearerAuth: [] }],
      querystring: LeagueQuerySchema,
      response: { 200: LeagueResponseSchema, ...errorResponses },
    },
  }, async (request) => catalog.listLeagues(request.query.id, request.query.season));

  app.get<{ Querystring: SeasonQuery }>("/v1/fixtures/rounds", {
    schema: {
      security: [{ bearerAuth: [] }],
      querystring: SeasonQuerySchema,
      response: { 200: RoundResponseSchema, ...errorResponses },
    },
  }, async (request) => catalog.listRounds(request.query.league, request.query.season));

  app.get<{ Querystring: FixtureQuery }>("/v1/fixtures", {
    schema: {
      security: [{ bearerAuth: [] }],
      querystring: FixtureQuerySchema,
      response: { 200: FixtureResponseSchema, ...errorResponses },
    },
  }, async (request) => {
    const { league, season, round, current } = request.query;
    if ((round && current) || (!round && !current)) {
      throw new ApplicationError(400, "INVALID_QUERY", "Invalid query", "Use exactly one of round or current=true.");
    }
    return catalog.listFixtures(league, season, round ? { round } : { current: true });
  });

  app.get<{ Querystring: StandingQuery }>("/v1/standings", {
    schema: {
      security: [{ bearerAuth: [] }],
      querystring: StandingQuerySchema,
      response: { 200: StandingResponseSchema, ...errorResponses },
    },
  }, async (request) => catalog.listStandingTables(
    request.query.league,
    request.query.season,
    request.query.type,
  ));
}
