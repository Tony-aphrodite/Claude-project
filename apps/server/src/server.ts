// ============================================================================
// Fastify server factory. Kept separate from the entry point so tests can
// boot a server without binding to a port.
//
// Performance-critical bits documented inline:
//  - We register a raw-body parser on the webhook route so HMAC verification
//    sees the byte-exact payload (JSON.stringify is not stable across runtimes).
//  - We disable the request id header (we generate our own) and reduce log
//    noise from health checks to keep dashboards readable.
// ============================================================================

import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";

import { loadEnv } from "./env.js";
import { AppError } from "./lib/errors.js";
import { getLogger } from "./logger.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhook.js";

export async function buildServer(): Promise<FastifyInstance> {
  const env = loadEnv();
  const logger = getLogger();

  const app = Fastify({
    logger,
    disableRequestLogging: false,
    bodyLimit: 1 * 1024 * 1024, // 1 MiB — Respond.io webhooks are small
    trustProxy: true, // Railway sits behind a reverse proxy
    genReqId: () => cryptoRandomId(),
  });

  // Capture the raw body for the webhook route so we can verify HMAC against
  // the byte-exact payload. Fastify's default JSON parser drops bytes after
  // parsing, so we replace it with one that keeps a Buffer reference.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      try {
        const buf = body as Buffer;
        const json = buf.length === 0 ? {} : JSON.parse(buf.toString("utf8"));
        // Stash the raw body on the request for the HMAC check.
        (json as { __rawBody?: Buffer }).__rawBody = buf;
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(sensible);
  await app.register(healthRoutes);
  await app.register(webhookRoutes);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code, ctx: err.context }, err.message);
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({
      error: { code: "internal_error", message: "Internal server error" },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    req.log.info({ url: req.url, method: req.method }, "not found");
    return reply.status(404).send({
      error: { code: "not_found", message: "Route not found" },
    });
  });

  // Keep startup log short — Fastify already prints listeners.
  logger.info({ env: env.NODE_ENV, port: env.PORT }, "server built");
  return app;
}

function cryptoRandomId(): string {
  // Cheap, high-cardinality request id. Prefix `req_` so logs are greppable.
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
