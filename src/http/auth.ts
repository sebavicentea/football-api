import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function authorize(appToken: string) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    if (request.routeOptions.url === "/health") return;

    const authorization = request.headers.authorization;
    const [scheme, token = ""] = authorization?.split(" ", 2) ?? [];
    const bearerToken = scheme?.toLowerCase() === "bearer" ? token : "";
    if (tokensMatch(bearerToken, appToken)) return;

    return reply
      .code(401)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "A valid bearer token is required.",
        code: "UNAUTHORIZED",
        requestId: request.id,
      });
  };
}
