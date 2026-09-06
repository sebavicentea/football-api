import swagger from "@fastify/swagger";
import Fastify, { type FastifyInstance } from "fastify";
import type { FootballCatalog } from "./application/catalog.js";
import { authorize } from "./http/auth.js";
import { registerErrorHandler } from "./http/error-handler.js";
import { registerFootballRoutes } from "./http/routes.js";

export interface AppOptions {
  appToken: string;
  catalog?: FootballCatalog;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Football Data API",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
    },
  });

  app.addHook("onRequest", authorize(options.appToken));
  registerErrorHandler(app);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/openapi.json", async () => app.swagger());
  if (options.catalog) registerFootballRoutes(app, options.catalog);

  await app.ready();
  return app;
}
