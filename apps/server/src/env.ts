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
   *
   * The default value is the sede team mailbox. We don't refuse non-dpm
   * addresses at boot (would crash production if Railway was left with a
   * stale value) — the caller is responsible for the recipient check at
   * use-time. See `resolveHandoffEmail()` in this file.
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

  /**
   * Bearer token required to hit /admin/* endpoints. The reset-conversation
   * endpoint blows away mensajes + lead_metadata + lead_stage for a contact
   * so testers can start a fresh scenario from the same WhatsApp number
   * without context bleed. Token must be at least 24 chars; leave empty in
   * environments that don't expose admin endpoints (e.g. CI).
   */
  ADMIN_RESET_TOKEN: z.string().min(24).optional().or(z.literal("")),

  /**
   * Per-lifecycle Respond.io workflow webhook URLs (5-12-feedback-round2
   * Option D, 2026-05-12). Miguel creates one workflow per lifecycle
   * target with an Incoming Webhook trigger + "Update Lifecycle" step,
   * and shares the 5 generated URLs.
   *
   * On every `leadStageService.applyTransition`, the server picks the
   * URL matching the new lead_stage and POSTs `{contactId: ...}` so the
   * workflow fires and updates the Respond.io contact's lifecycle.
   * Respond.io v2's contact PUT endpoint silently drops the `lifecycle`
   * field (probed extensively 2026-05-12), so the workflow-trigger path
   * is the ONLY way to drive lifecycle from server logic.
   *
   * Each URL is independent — missing one just disables sync for that
   * stage. Empty / undefined disables the whole feature gracefully.
   */
  RESPONDIO_LIFECYCLE_WEBHOOK_NEW_LEAD: z.string().url().optional().or(z.literal("")),
  RESPONDIO_LIFECYCLE_WEBHOOK_ENGAGING: z.string().url().optional().or(z.literal("")),
  RESPONDIO_LIFECYCLE_WEBHOOK_FOLLOWING_UP: z.string().url().optional().or(z.literal("")),
  RESPONDIO_LIFECYCLE_WEBHOOK_CUSTOMER: z.string().url().optional().or(z.literal("")),
  RESPONDIO_LIFECYCLE_WEBHOOK_LOST_LEAD: z.string().url().optional().or(z.literal("")),

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

const HANDOFF_EMAIL_FALLBACK = "gilit@dpmdiving.com";

/**
 * Resolve the recipient for "lead handed off" notifications. Enforces a
 * sede-domain check at use-time (instead of at boot) so a stale Railway
 * env value can't silently route customer-confirmation notifications to a
 * personal mailbox — but a misconfigured env doesn't crash the server
 * either. When the configured value doesn't end in `@dpmdiving.com` we
 * log a structured warn and fall back to the canonical sede address.
 *
 * 2026-05-12 incident this guards against: Railway env had
 * `aupwork00@gmail.com` (Steve's dev mailbox) left over from the first
 * week of testing. Five OCR auto-confirm notifications leaked to that
 * personal Gmail before Miguel caught it. The fix is two-layer: update
 * Railway env to the right value, AND have the code refuse to use any
 * non-@dpmdiving.com address regardless of how Railway is configured.
 */
export function resolveHandoffEmail(
  logger?: { warn: (obj: unknown, msg: string) => void },
): string {
  const env = loadEnv();
  const configured = env.HANDOFF_NOTIFICATION_EMAIL;
  if (!configured || !configured.toLowerCase().endsWith("@dpmdiving.com")) {
    logger?.warn(
      { configured, fallback: HANDOFF_EMAIL_FALLBACK },
      "HANDOFF_NOTIFICATION_EMAIL is not a @dpmdiving.com address — using fallback",
    );
    return HANDOFF_EMAIL_FALLBACK;
  }
  return configured;
}
