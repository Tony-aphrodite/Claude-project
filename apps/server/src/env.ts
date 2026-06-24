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
  /**
   * Additional accepted HMAC secrets for Respond.io webhooks (comma-
   * separated). Use when the workspace has multiple webhook integrations
   * (e.g. Sync - Ciclo de vida / Sync - Cesionario / Sync - Etiquetas)
   * and each one was created with an independent `Clave de firma` that
   * Respond.io won't let operators edit after creation.
   *
   * Whitespace around each entry is trimmed; empty entries are dropped.
   * Each non-empty entry is validated to be at least 8 chars to catch
   * obvious config typos (a 4-char "key" is almost certainly truncated).
   */
  RESPOND_IO_WEBHOOK_SECRETS_EXTRA: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((raw) => {
      if (!raw) return [] as string[];
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    })
    .superRefine((arr, ctx) => {
      for (const [i, entry] of arr.entries()) {
        if (entry.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `RESPOND_IO_WEBHOOK_SECRETS_EXTRA[${i}] too short (need >=8 chars)`,
          });
        }
      }
    }),
  RESPOND_IO_API_KEY: z.string().min(8),
  RESPOND_IO_API_BASE_URL: z.string().url().default("https://api.respond.io/v2"),
  // Meta WhatsApp Business catalog id for Colomba's send_product_card tool.
  // Required to send interactive product cards (Respond.io v2 spec rejects
  // the call with 400 if catalogId is missing from the message body). Same
  // catalog is shared across DPM sedes — the per-sede surface is the
  // product_retailer_id allowlist, not the catalog itself.
  META_CATALOG_ID: z.string().min(8, "META_CATALOG_ID looks empty/short"),
  // Direct Meta WhatsApp Cloud API credentials (2026-06-04). Used by
  // services/meta-whatsapp.ts to bypass Respond.io for catalog product
  // sends, since Respond.io public REST API does not expose the
  // whatsapp_interactive message type that catalog cards require.
  //
  // Where to find these in Meta Business Manager:
  //   • META_WHATSAPP_PHONE_NUMBER_ID — WhatsApp Manager → API Setup →
  //     "Phone number ID" (15-16 digit numeric id; not the +16592814080
  //     phone number string).
  //   • META_WHATSAPP_ACCESS_TOKEN — Business Settings → System Users →
  //     generate token with whatsapp_business_messaging scope. The
  //     temporary 24h token under WhatsApp → API Setup works for a first
  //     test but rotates daily; use a permanent system-user token for prod.
  //
  // Both optional: if missing, the Meta-direct fallback is disabled and
  // the AI continues to degrade to text when Respond.io catalog sends
  // fail (the previous behavior).
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  // WhatsApp Business channel id in Respond.io. v2 product-card sends
  // require this in the body so Respond.io knows which connected number
  // to use as origin. Defaults to 274637 (WAP EN main, workspace 216239).
  RESPOND_IO_CHANNEL_ID: z.string().default("274637"),
  // 2026-06-05 (Miguel Slice 3d): user/team id in Respond.io to assign as
  // the AI agent for conversations Francisco is handling. Without this set,
  // conversations stay "Sin asignar" in the panel. Find this id in
  // Respond.io → Settings → Team → user/team properties; numeric id only.
  // Optional — when missing, AI conversations remain unassigned (no harm).
  //
  // Originally a single id (Francisco Emilio AI for Phi Phi). Multi-sede
  // production needs per-sede AI users (Colomba AI for GA, Emma for KT,
  // etc.); use RESPOND_IO_AI_ASSIGNEE_IDS below to register the additional
  // ids. The takeover guard treats ANY id in the union as "the AI".
  RESPOND_IO_AI_ASSIGNEE_ID: z.coerce.number().int().positive().optional(),
  // 2026-06-15: additional AI assignee ids as CSV (e.g. "567890,789012"
  // for Colomba AI + Emma + John). Whitespace around commas is tolerated.
  // The singular RESPOND_IO_AI_ASSIGNEE_ID stays for backward compat (it's
  // unioned with these). Empty / unset = no extras.
  RESPOND_IO_AI_ASSIGNEE_IDS: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((raw) => {
      if (!raw) return [] as number[];
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
          const n = Number(s);
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
            throw new Error(`RESPOND_IO_AI_ASSIGNEE_IDS: "${s}" is not a positive integer`);
          }
          return n;
        });
    }),
  // 2026-06-07 (Miguel sales logger spec): the Apps Script endpoint that
  // writes one row to DPM_Ventas_Master per call. SAME URL the human
  // workflow "DPM Ventas Master Logger" uses — Miguel confirmed the AI
  // posts directly to the same /exec endpoint, just bypassing the
  // workflow. URL is global (one for all sedes); the script routes by the
  // `sede` field in the body. Required in production.
  SALES_LOGGER_URL: z.string().url().optional().or(z.literal("")),
  // Auth token Miguel's Apps Script verifies before accepting the row.
  // Sent as the `token` field in the JSON BODY (not a header). Without
  // this set, sales-logger calls will be rejected by the script. Required
  // in production.
  SALES_LOGGER_TOKEN: z.string().optional().or(z.literal("")),
  // Dev override that beats SALES_LOGGER_URL. Point at webhook.site or
  // a local proxy to test without writing to Miguel's real sheet.
  SALES_LOGGER_URL_OVERRIDE: z.string().optional().or(z.literal("")),
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
   * Feature flag for the Apps Script push-back (Miguel feedback 2026-06-20
   * "ninguna AI descuenta disponibilidad del roster"). When set to "true",
   * every confirmed roster booking also POSTs a deduction to Miguel's
   * Apps Script so his Google Sheet reflects the booking. Defaults to off
   * because Miguel's Apps Script side needs an `action=confirmBooking`
   * handler that doesn't exist yet — flip this to "true" only AFTER his
   * Apps Script is updated to accept the POST shape documented in
   * services/apps-script.ts:pushBookingBackToSheet.
   */
  APPS_SCRIPT_PUSH_BACK_ENABLED: z.string().optional().or(z.literal("")),

  /**
   * Per-sede activation of the intelligent roster engine (Miguel
   * 2026-06-24 spec v2.1).
   *
   * CSV of sede names. Empty / unset = engine OFF for every sede
   * (current behaviour — boat-counter model owns availability).
   *
   * Example: ROSTER_ENGINE_ENABLED_SEDES="Koh Tao,Phi Phi"
   *
   * For a sede in this list, the AI's tool surface gains
   * `validar_cupo_grupo` and the prompt should call it BEFORE
   * solicitar_deposito. Without it, the AI behaves as today
   * (consultar_disponibilidad + solicitar_deposito only).
   *
   * Whitespace around commas is tolerated. Per-sede toggle so we can
   * roll out one sede at a time per spec §9 (shadow mode → KT live →
   * replicate).
   */
  ROSTER_ENGINE_ENABLED_SEDES: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((raw) => {
      if (!raw) return [] as string[];
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }),

  /**
   * When set to "true", every `validar_cupo_grupo` call also runs the
   * legacy `consultar_disponibilidad` and logs both verdicts
   * side-by-side. Lets us monitor divergence during the shadow rollout
   * without flipping the engine to authoritative. Default off.
   */
  ROSTER_ENGINE_SHADOW_LOGGING: z.string().optional().or(z.literal("")),

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
  RESPONDIO_LIFECYCLE_WEBHOOK_IN_PROCESS: z.string().url().optional().or(z.literal("")),
  RESPONDIO_LIFECYCLE_WEBHOOK_PAYMENT: z.string().url().optional().or(z.literal("")),
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

/**
 * All Respond.io user ids that count as "the AI" for the takeover guard.
 * Unions the singular RESPOND_IO_AI_ASSIGNEE_ID (Francisco Emilio AI,
 * primary) with the CSV RESPOND_IO_AI_ASSIGNEE_IDS (additional per-sede
 * AIs like Colomba AI for GA, Emma for KT, etc.). The takeover guard
 * silences the AI when the conversation's assignee is anyone outside
 * this set.
 *
 * Empty array means no AI is configured — treat all assignees as humans
 * (the takeover guard becomes a no-op).
 */
export function getAiAssigneeIds(): number[] {
  const env = loadEnv();
  const ids: number[] = [];
  if (env.RESPOND_IO_AI_ASSIGNEE_ID !== undefined) {
    ids.push(env.RESPOND_IO_AI_ASSIGNEE_ID);
  }
  for (const extra of env.RESPOND_IO_AI_ASSIGNEE_IDS) {
    if (!ids.includes(extra)) ids.push(extra);
  }
  return ids;
}

/**
 * True iff the given id matches any configured AI assignee (singular or
 * CSV extras). Defensive against string/number shape variation since
 * Respond.io's payload uses both depending on event_type.
 */
export function isAiAssignee(id: string | number | null | undefined): boolean {
  if (id === null || id === undefined || id === "") return false;
  const target = String(id);
  return getAiAssigneeIds().some((aiId) => String(aiId) === target);
}

/**
 * True iff the intelligent roster engine is enabled for `sedeNombre`.
 * Matches `sedes.nombre` verbatim (e.g. "Koh Tao", "Gili Air").
 * Defaults to false when the env var is empty / unset.
 */
export function isRosterEngineEnabled(sedeNombre: string): boolean {
  const env = loadEnv();
  return env.ROSTER_ENGINE_ENABLED_SEDES.includes(sedeNombre);
}

/**
 * True iff the shadow-mode comparison logging is enabled. Shadow mode
 * still routes sales through the legacy consultar_disponibilidad
 * verdict — the engine output is logged side-by-side for divergence
 * audit (spec §9).
 */
export function isRosterEngineShadowLoggingEnabled(): boolean {
  const env = loadEnv();
  return env.ROSTER_ENGINE_SHADOW_LOGGING === "true";
}
