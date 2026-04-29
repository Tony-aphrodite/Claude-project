// Entry point. Loads env, builds the server, listens on $PORT.
// Graceful shutdown drains in-flight requests, then closes the DB pool.

import { closeDb } from "@dpm/db";

import { loadEnv } from "./env.js";
import { getLogger } from "./logger.js";
import { buildServer } from "./server.js";
import { startFollowUpWorkers } from "./services/follow-up.js";
import { startPiiRetentionCron } from "./services/pii-retention.js";

async function main() {
  const env = loadEnv();
  const log = getLogger();

  const app = await buildServer();

  // Background workers — only in production / staging. We don't want a dev
  // shell hammering Anthropic with synthetic follow-ups.
  const enableWorkers = env.NODE_ENV !== "test" && process.env.WORKERS !== "off";
  const followUpWorkers = enableWorkers ? startFollowUpWorkers() : null;
  const piiCron = enableWorkers ? startPiiRetentionCron() : null;

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    try {
      followUpWorkers?.stop();
      piiCron?.stop();
      await app.close();
      await closeDb();
      log.info("shutdown complete");
      process.exit(0);
    } catch (err) {
      log.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  log.info({ port: env.PORT, workers: enableWorkers }, "server listening");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal startup error:", err);
  process.exit(1);
});
