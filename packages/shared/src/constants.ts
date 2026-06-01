// ============================================================================
// Project-wide constants. Single source of truth for tunable values that
// the architecture depends on. Values are derived from the project guide
// (DPM_Diving_Project_Guide.md §17, §22 and "Critical Constants" appendix).
// ============================================================================

export const LATENCY_TARGETS = {
  P50_MS: 1500,
  P95_MS: 3000,
  P99_MS: 4000,
} as const;

export const CACHE_TTL = {
  // Anthropic prompt-cache TTLs we declare via cache_control
  SYSTEM_BLOCK: "1h",
  KB_BLOCK: "1h",
  HISTORY_BLOCK: "5m",
  // Roster cache (Supabase) — lives between Apps Script polls
  ROSTER_SECONDS: 600,
} as const;

export const FOLLOW_UP_LEVELS = {
  LEVEL_1: { hours: 4, requiresTemplate: false },
  LEVEL_2: { hours: 24, requiresTemplate: false },
  LEVEL_3: { hours: 48, requiresTemplate: true },
  LEVEL_4: { hours: 24 * 7, requiresTemplate: true },
  LEVEL_5: { hours: 24 * 30, requiresTemplate: true },
} as const;

export type FollowUpLevel = keyof typeof FOLLOW_UP_LEVELS;

/**
 * Per-sede behavior config. Stored as JSONB on `sedes.behavior_config`.
 * Every field is optional — empty/absent fields fall back to the global
 * defaults (FOLLOW_UP_LEVELS, no post-purchase grace).
 *
 * Why per-sede: Miguel asked 2026-05-26 to customize Phi Phi without
 * touching the other 4 sedes — Phi Phi gets a tighter follow-up cadence
 * (6h / +6h, then stop) and a 2-hour grace window after the deposit is
 * paid where Francisco still handles logistics questions before being
 * silenced for the human team.
 */
export type SedeBehaviorConfig = {
  /**
   * Override the follow-up cadence for this sede. Each entry is the
   * `hours` value for that level, in order. So `[6, 12]` means
   * LEVEL_1 fires after 6h of silence and LEVEL_2 after 12h elapsed
   * (still measured from the last activity, not from LEVEL_1). After the
   * last level, the scanner stops scheduling new follow-ups for the
   * conversation — but a customer who later writes back is handled
   * normally (the reactive path is unaffected).
   *
   * Empty or absent → use global FOLLOW_UP_LEVELS (4h / 24h / 48h / 7d / 30d).
   */
  follow_up_hours?: number[];

  /**
   * Minutes after `deposit_paid` during which the AI keeps handling the
   * conversation (logistics: meeting point, what to bring, timing).
   * After this window the conversation transitions to `handed_off` and
   * the AI goes silent. `0` or absent → no grace; AI is silenced
   * immediately at deposit_paid (legacy behavior). Inside the window,
   * `handoff_human` still escalates instantly.
   */
  post_purchase_grace_minutes?: number;

  /**
   * Seconds after `deposit_paid` during which the AI stays silent so
   * that any Respond.io onboarding workflow message (e.g. the generic
   * "Onboarding Cliente Confirmado" bilingual welcome that fires at
   * ~+60s on lifecycle update) lands first. After this delay elapses
   * AND while `post_purchase_grace_minutes` is still in effect, the AI
   * resumes handling the conversation. `0` or absent → no delay.
   *
   * Only meaningful when `post_purchase_grace_minutes > 0`.
   */
  post_purchase_start_delay_seconds?: number;

  /**
   * Bilingual closing message sent to the customer right before the
   * `deposit_paid → handed_off` transition at the end of the grace
   * window. Resolved by customer language; falls back to `en` if the
   * detected language isn't in the map. If both keys are absent the
   * scanner transitions silently (legacy behavior).
   */
  grace_closing_message?: {
    es?: string;
    en?: string;
  };
};

export const FOLLOW_UP_SCANNER_INTERVAL_MS = 15 * 60 * 1000; // 15 min

export const CONCURRENCY = {
  FOLLOW_UP_WORKERS: 10,
  REGRESSION_WORKERS: 5,
} as const;

export const TIMEOUTS = {
  APPS_SCRIPT_MS: 2000,
  // Bumped from 30s 2026-05-11 evening — Tony test (conv a8f24502) showed
  // the solicitar_deposito path can chain 2 tool round-trips plus a
  // 3-bubble final response, easily exceeding 30s. The first message
  // landed at 22.6s (close to the limit); the second hung past 30s and
  // left the conversation half-transitioned (tool ran, no reply sent).
  CLAUDE_API_MS: 60000,
  RESPOND_IO_MS: 5000,
  // HTTP keep-alive idle timeout for outbound connections
  KEEP_ALIVE_MS: 60000,
} as const;

export const HISTORY_WINDOW = {
  // Last N messages we always include verbatim in Bloque 3
  MAX_MESSAGES: 30,
  // Cap total tokens for safety even if MAX_MESSAGES is exceeded
  MAX_TOKENS: 4000,
} as const;

export const REGRESSION = {
  // PromptVersion can be auto-promoted to active only if pass rate >= this
  MIN_PASS_RATE: 0.95,
  // LLM-judge confidence below which we route to human review
  HUMAN_REVIEW_CONFIDENCE_THRESHOLD: 0.7,
  // Number of conversations in the curated suite (project requirement)
  SUITE_SIZE: 100,
} as const;

export const PII_RETENTION_DAYS = 365; // 12 months — guide §16 #8

// ── Sede registry (5 pilot sedes, guide §1) ─────────────────────────────────
// Authoritative names are stored in the `sedes` table; this enum is for
// type-safety in code paths that branch on sede explicitly.
export const SEDE_NAMES = [
  "Koh Tao",
  "Phi Phi",
  "Gili Trawangan",
  "Gili Air",
  "Nusa Penida",
] as const;
export type SedeName = (typeof SEDE_NAMES)[number];

export const SEDE_TIMEZONES: Record<SedeName, string> = {
  "Koh Tao": "Asia/Bangkok",
  "Phi Phi": "Asia/Bangkok",
  "Gili Trawangan": "Asia/Makassar",
  "Gili Air": "Asia/Makassar",
  "Nusa Penida": "Asia/Makassar",
};

export const SEDE_CURRENCIES: Record<SedeName, { code: string; symbol: string }> = {
  "Koh Tao": { code: "THB", symbol: "฿" },
  "Phi Phi": { code: "THB", symbol: "฿" },
  "Gili Trawangan": { code: "IDR", symbol: "Rp" },
  "Gili Air": { code: "IDR", symbol: "Rp" },
  "Nusa Penida": { code: "IDR", symbol: "Rp" },
};

export const PILOT_SEDE: SedeName = "Gili Trawangan";

// ── Anthropic pricing (USD per 1M tokens) — Sonnet 4.6 ─────────────────────
// Used by cost estimator + dashboard. Update when Anthropic pricing changes.
export const ANTHROPIC_PRICING = {
  "claude-sonnet-4-6": {
    inputUsdPerMTok: 3.0,
    cacheReadUsdPerMTok: 0.3,
    cacheWriteUsdPerMTok: 3.75,
    outputUsdPerMTok: 15.0,
  },
  "claude-haiku-4-5-20251001": {
    inputUsdPerMTok: 0.8,
    cacheReadUsdPerMTok: 0.08,
    cacheWriteUsdPerMTok: 1.0,
    outputUsdPerMTok: 4.0,
  },
} as const;

export type AnthropicModel = keyof typeof ANTHROPIC_PRICING;
