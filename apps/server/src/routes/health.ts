// Health endpoints used by Railway and the panel uptime check.
// /health is a cheap process-alive probe.
// /ready does shallow DB ping; Railway uses this as the readiness gate.

import type { FastifyInstance } from "fastify";

import { getDb } from "@dpm/db";
import { sql } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.get("/ready", async (_req, reply) => {
    try {
      const db = getDb();
      // Race the DB probe against a 5s timeout. Without this, a pool-exhaustion
      // event (2026-06-12 / 06-15 incidents) leaves /ready blocked waiting
      // for a connection that will never arrive — Railway's healthcheck
      // eventually times out and restarts us, but only after ~30s of lost
      // traffic. Failing fast (503 in 5s) makes Railway's healthcheckTimeout
      // the real restart trigger instead of a slow fastify-level hang.
      const probe = db.execute(sql`select 1`);
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("readiness probe timeout")), 5_000),
      );
      await Promise.race([probe, timeout]);
      return reply.send({ ok: true });
    } catch (err) {
      reply.log.error({ err }, "/ready probe failed");
      return reply.status(503).send({ ok: false, error: "db_unreachable" });
    }
  });
}
