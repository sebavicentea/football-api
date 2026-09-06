import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("HTTP interface", () => {
  it("reports process health without authentication", async () => {
    const currentApp = await buildApp({ appToken: "test-token" });
    app = currentApp;

    const response = await currentApp.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("protects the football contract with a bearer token", async () => {
    const currentApp = await buildApp({ appToken: "test-token" });
    app = currentApp;

    const response = await currentApp.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(401);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      title: "Unauthorized",
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("serves the generated OpenAPI contract to an authenticated caller", async () => {
    const currentApp = await buildApp({ appToken: "test-token" });
    app = currentApp;

    const response = await currentApp.inject({
      method: "GET",
      url: "/openapi.json",
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "Football Data API", version: "1.0.0" },
    });
  });
});
