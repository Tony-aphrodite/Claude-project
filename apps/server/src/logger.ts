// Pino-based logger. In development we pretty-print; in production we emit
// newline-delimited JSON that Axiom/Logtail ingest natively.

import pino from "pino";

import { loadEnv } from "./env.js";

let _logger: pino.Logger | undefined;

export function getLogger(): pino.Logger {
  if (_logger) return _logger;
  const env = loadEnv();
  const isDev = env.NODE_ENV !== "production";

  _logger = pino({
    level: env.LOG_LEVEL,
    base: {
      service: "dpm-server",
      env: env.NODE_ENV,
    },
    // Redact common secret-bearing fields automatically. We pass headers
    // through the request log; redacting prevents an accidental leak.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-respond-io-signature']",
        "*.apiKey",
        "*.apiSecret",
        "*.password",
      ],
      remove: false,
      censor: "[REDACTED]",
    },
    transport: isDev
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        }
      : undefined,
  });
  return _logger;
}
