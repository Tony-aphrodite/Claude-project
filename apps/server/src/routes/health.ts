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
      // 1ms query — confirms the pool can hand out a connection.
      await db.execute(sql`select 1`);
      return reply.send({ ok: true });
    } catch (err) {
      reply.log.error({ err }, "/ready probe failed");
      return reply.status(503).send({ ok: false, error: "db_unreachable" });
    }
  });
}
