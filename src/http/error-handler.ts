import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import { ApplicationError } from "../application/errors.js";
import { ProviderError } from "../application/provider.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return problem(reply, request.id, 400, "INVALID_QUERY", "Invalid query", "The request query is invalid.");
    }
    if (error instanceof ApplicationError) {
      return problem(reply, request.id, error.status, error.code, error.title, error.message);
    }
    if (error instanceof ProviderError) {
      const status = error.code === "unavailable" ? 503 : 502;
      const code = error.code === "unavailable" ? "DATA_TEMPORARILY_UNAVAILABLE" : "UPSTREAM_INVALID_RESPONSE";
      return problem(reply, request.id, status, code, "Football data unavailable", "Football data could not be retrieved.");
    }

    request.log.error(error);
    return problem(reply, request.id, 500, "INTERNAL_ERROR", "Internal server error", "The request could not be completed.");
  });
}

function problem(
  reply: FastifyReply,
  requestId: string,
  status: number,
  code: string,
  title: string,
  detail: string,
) {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, detail, code, requestId });
}
