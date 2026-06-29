// ============================================================================
// Sede identification.
//
// Owner-confirmed mechanism (2026-05-04): Respond.io populates a contact
// custom field named "Branch" via the welcome workflow. Possible values are
// the five sede names verbatim ("Gili Trawangan", "Gili Air", "Nusa Penida",
// "Koh Tao", "Koh Phi Phi") or empty.
//
// As of 2026-05-17 (David launch), ALL FIVE sedes are AI-enabled:
// "Gili Trawangan" (John), "Gili Air" (Colomba), "Koh Tao" (Emma),
// "Koh Phi Phi" (Francisco Emilio), "Nusa Penida" (David). The
// `branch_other_sede` short-circuit now only fires for branches we
// don't recognize at all (typo / new sede added in Respond.io before
// our seeds catch up).
//
// Legacy support: if no Branch field is present (older test fixtures, manual
// curl probes), we still try the original `sede:*` tag scheme. This is opt-in
// via env flag SEDE_TAG_FALLBACK=1 so production never silently drifts.
// ============================================================================

import { eq } from "drizzle-orm";

import { getDb, sedes, type Sede } from "@dpm/db";
import { readBranchField, type RespondIoIncomingMessage } from "@dpm/shared";

const SEDE_TAG_PREFIX = "sede:";

// AI-enabled sedes. All 5 DPM centers are wired as of 2026-05-17.
// Branch values come from Respond.io verbatim — keep them in sync with
// what Miguel's workflow writes to the field. To add a new sede later,
// add the Branch string here AND seed prompts_versiones +
// kb_documents rows for it.
const AI_ENABLED_SEDE_NAMES = [
  "Gili Trawangan",
  "Gili Air",
  "Koh Tao",
  "Koh Phi Phi",
  "Nusa Penida",
] as const;
export type AiEnabledSedeName = (typeof AI_ENABLED_SEDE_NAMES)[number];

function isAiEnabled(branch: string): branch is AiEnabledSedeName {
  return (AI_ENABLED_SEDE_NAMES as readonly string[]).includes(branch);
}

// Channel-id fallback for v2 webhooks that omit customFields. Per Miguel's
// workspace 216239:
//   • 274637 → WAP EN (main) — shared across all sedes for outbound but the
//     contact's Branch field is the source of truth. When the v2 payload
//     hides Branch we default to Gili Trawangan (the pilot sede) rather
//     than guessing — wrong sede = wrong KB/prompt and a confused customer.
const PILOT_WHATSAPP_CHANNEL_ID = "274637" as const;
const DEFAULT_SEDE_WHEN_CHANNEL_FALLBACK = "Gili Trawangan" as const;

export type SedeResolution =
  | { ok: true; sede: Sede; via: "branch" | "tag" | "channel" }
  | {
      ok: false;
      reason: "branch_other_sede" | "branch_empty" | "sede_not_seeded";
      branchValue: string | null;
    };

export class SedeService {
  // Tiny in-memory cache. Sedes change at most weekly; staleness is fine.
  private cache = new Map<string, { sede: Sede; expiresAt: number }>();
  private readonly TTL_MS = 60_000;

  async findByName(nombre: string): Promise<Sede | null> {
    const cacheKey = `name:${nombre}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.sede;

    const db = getDb();
    const [row] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.nombre, nombre))
      .limit(1);
    if (!row) return null;
    this.cache.set(cacheKey, { sede: row, expiresAt: Date.now() + this.TTL_MS });
    return row;
  }

  async findByTag(tag: string): Promise<Sede | null> {
    const cacheKey = `tag:${tag}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.sede;

    const db = getDb();
    const [row] = await db
      .select()
      .from(sedes)
      .where(eq(sedes.respondIoTag, tag))
      .limit(1);
    if (!row) return null;
    this.cache.set(cacheKey, { sede: row, expiresAt: Date.now() + this.TTL_MS });
    return row;
  }

  /**
   * Resolve sede from the inbound webhook contact, applying the AI-enabled
   * gate (currently Gili Trawangan + Gili Air).
   *
   * Returns ok=true when the contact's Branch field equals one of the
   * AI-enabled sedes. Any other value (human-only sede / empty) returns
   * ok=false with a reason the handler uses to short-circuit with HTTP
   * 200 `ignored`.
   */
  async resolveForPilot(
    contact: RespondIoIncomingMessage["contact"],
    channelId?: string | null,
  ): Promise<SedeResolution> {
    const branch = readBranchField(contact);

    // Primary path: Branch contact field.
    if (branch) {
      if (!isAiEnabled(branch)) {
        return { ok: false, reason: "branch_other_sede", branchValue: branch };
      }
      const sede = await this.findByName(branch);
      if (!sede) {
        return {
          ok: false,
          reason: "sede_not_seeded",
          branchValue: branch,
        };
      }
      return { ok: true, sede, via: "branch" };
    }

    // V2 channel fallback DISABLED in multi-sede production (2026-06-15).
    //
    // Background: while only Gili Trawangan was live, when a v2 webhook
    // omitted Branch we'd guess GT from channel 274637 (WAP EN main, shared
    // across sedes). That was safe because GT was the only target.
    //
    // Now that PP, GA, KT, GT, NP all run on the same WAP EN channel, the
    // channel id alone can't pick the right sede. Worse: it was silently
    // routing GA/PP/KT/NP contacts to the GT prompt + GT roster when their
    // workflows hadn't set Branch yet — invisible misrouting.
    //
    // New behavior: empty Branch returns branch_empty (gate rejection,
    // visible in logs). Workflows MUST set Branch — that's the documented
    // contract per [[architecture_branch_field_workflow_trigger]]. If a
    // workflow forgets, the message gets rejected loudly instead of being
    // routed to the wrong sede.
    //
    // Set SEDE_CHANNEL_FALLBACK=1 if a single-sede deploy needs the legacy
    // behavior back; the env-gated branch below preserves it.
    if (
      process.env.SEDE_CHANNEL_FALLBACK === "1" &&
      channelId &&
      channelId === PILOT_WHATSAPP_CHANNEL_ID
    ) {
      const sede = await this.findByName(DEFAULT_SEDE_WHEN_CHANNEL_FALLBACK);
      if (!sede) {
        return {
          ok: false,
          reason: "sede_not_seeded",
          branchValue: DEFAULT_SEDE_WHEN_CHANNEL_FALLBACK,
        };
      }
      return { ok: true, sede, via: "channel" };
    }

    // Legacy fallback (off by default): tag-based identification.
    if (process.env.SEDE_TAG_FALLBACK === "1") {
      const tag = contact.tags?.find((t) => t.startsWith(SEDE_TAG_PREFIX));
      if (tag) {
        const sede = await this.findByTag(tag);
        if (sede && isAiEnabled(sede.nombre)) {
          return { ok: true, sede, via: "tag" };
        }
        if (sede) {
          return {
            ok: false,
            reason: "branch_other_sede",
            branchValue: sede.nombre,
          };
        }
      }
    }

    return { ok: false, reason: "branch_empty", branchValue: null };
  }
}

export const sedeService = new SedeService();

export const PILOT_SEDE_NAME_CONST = DEFAULT_SEDE_WHEN_CHANNEL_FALLBACK;
export const AI_ENABLED_SEDE_NAMES_CONST = AI_ENABLED_SEDE_NAMES;

// ─── Per-sede webhook routing (Miguel 2026-06-15) ──────────────────────────
// Stable URL-safe slug for each AI-enabled sede, used in the per-sede
// webhook routes (/webhook/respond-io/<slug>). Miguel asked for per-sede
// webhook isolation so he can toggle just one sede off from Respond.io's
// UI if it misbehaves — without bringing down the other four.
//
// Slug format: kebab-case of the canonical sede name. Keep stable —
// changing a slug means Miguel has to update the URL on his end.
const SEDE_NAME_TO_SLUG: Record<AiEnabledSedeName, string> = {
  "Koh Phi Phi": "koh-phi-phi",
  "Gili Air": "gili-air",
  "Koh Tao": "koh-tao",
  "Gili Trawangan": "gili-trawangan",
  "Nusa Penida": "nusa-penida",
};

const SEDE_SLUG_TO_NAME: Record<string, AiEnabledSedeName> = Object.fromEntries(
  Object.entries(SEDE_NAME_TO_SLUG).map(([name, slug]) => [
    slug,
    name as AiEnabledSedeName,
  ]),
) as Record<string, AiEnabledSedeName>;

/**
 * Map a URL slug (e.g. "gili-air") to the canonical Branch / sede name
 * ("Gili Air") used in the rest of the codebase. Returns null when the
 * slug isn't a known AI-enabled sede.
 */
export function sedeSlugToName(slug: string): AiEnabledSedeName | null {
  return SEDE_SLUG_TO_NAME[slug.toLowerCase()] ?? null;
}

/** Inverse — for log messages and URL building. */
export function sedeNameToSlug(name: string): string | null {
  return SEDE_NAME_TO_SLUG[name as AiEnabledSedeName] ?? null;
}

/** All known sede slugs — used to register the per-sede webhook routes. */
export const SEDE_SLUGS = Object.values(SEDE_NAME_TO_SLUG);
