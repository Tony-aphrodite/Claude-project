// ============================================================================
// Validate process.env at startup. Fail fast on misconfiguration so we never
// accept a webhook with an unset Anthropic key (which would log a secret-less
// error mid-request and confuse triage).
// ============================================================================

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  ANTHROPIC_API_KEY: z.string().min(20, "ANTHROPIC_API_KEY looks empty/short"),
  ANTHROPIC_MODEL_PRIMARY: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_FALLBACK: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MODEL_JUDGE: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  ANTHROPIC_DAILY_SPEND_LIMIT_USD: z.coerce.number().positive().default(100),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  RESPOND_IO_WEBHOOK_SECRET: z.string().min(8),
  RESPOND_IO_API_KEY: z.string().min(8),
  RESPOND_IO_API_BASE_URL: z.string().url().default("https://api.respond.io/v2"),
  // Alternative shared-secret auth for webhook callers that cannot compute
  // an HMAC of the body (e.g. Respond.io's "Petición HTTP" workflow step,
  // which sends static headers only). When set and matched, the route
  // accepts the request without HMAC verification. Leave empty to disable.
  WEBHOOK_WORKFLOW_TOKEN: z.string().min(16).optional().or(z.literal("")),
  // Test-mode safety filter. When set, the AI only processes contacts that
  // carry this tag in their Respond.io tags array. Used during pilot ramp:
  // the operator tags only the test contact (e.g. their own number) and the
  // server ignores everyone else even if they pass the Branch sede gate.
  // Leave empty in production to process all gated contacts.
  PILOT_REQUIRE_TAG: z.string().optional().or(z.literal("")),

  /**
   * Address that receives "lead handed off to human" notifications. Defined
   * in DPM_AI_LAUNCH (2026-05-07) as gilit@dpmdiving.com for Gili
   * Trawangan. Until SMTP / Resend credentials are wired in (Miguel has not
   * provided them at the time of this commit), the server logs a structured
   * `handoff_email_pending` entry and the actual send happens when the
   * email transport is configured.
   */
  HANDOFF_NOTIFICATION_EMAIL: z
    .string()
    .email()
    .optional()
    .default("gilit@dpmdiving.com"),
  /**
   * Optional: API key for the email transport (e.g. Resend). When unset,
   * notifications stay queued in `errores`/`notifications` with type
   * `handoff_email_pending` so an operator can replay them once SMTP is
   * configured.
   */
  RESEND_API_KEY: z.string().optional().or(z.literal("")),

  APPS_SCRIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),

  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  AXIOM_TOKEN: z.string().optional().or(z.literal("")),
  AXIOM_DATASET: z.string().default("dpm-server-prod"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function loadEnv(): Env {
  if (_env) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Print a helpful diff of what's missing/wrong before exiting.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Environment validation failed:\n${issues}`);
    throw new Error("Invalid environment configuration");
  }
  _env = parsed.data;
  return _env;
}
