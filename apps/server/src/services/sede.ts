// ============================================================================
// Sede identification.
//
// Owner-confirmed mechanism (2026-05-04): Respond.io populates a contact
// custom field named "Branch" via the welcome workflow. Possible values are
// the five sede names verbatim ("Gili Trawangan", "Gili Air", "Nusa Penida",
// "Koh Tao", "Koh Phi Phi") or empty.
//
// As of 2026-05-15 (Colomba GA launch), TWO sedes are accepted for AI
// processing: "Gili Trawangan" (John) and "Gili Air" (Colomba). The
// other three sedes (Nusa Penida / Koh Tao / Koh Phi Phi) are still
// human-only and any inbound with one of those Branch values returns
// `branch_other_sede` so the human flow handles it.
//
// Legacy support: if no Branch field is present (older test fixtures, manual
// curl probes), we still try the original `sede:*` tag scheme. This is opt-in
// via env flag SEDE_TAG_FALLBACK=1 so production never silently drifts.
// ============================================================================

import { eq } from "drizzle-orm";

import { getDb, sedes, type Sede } from "@dpm/db";
import { readBranchField, type RespondIoIncomingMessage } from "@dpm/shared";

const SEDE_TAG_PREFIX = "sede:";

// AI-enabled sedes. To onboard another sede (Koh Tao / Nusa Penida / Koh
// Phi Phi) add it here AND seed the corresponding prompts_versiones +
// kb_documents rows for it. Branch values come from Respond.io verbatim
// — keep them in sync with what Miguel's workflow writes to the field.
const AI_ENABLED_SEDE_NAMES = ["Gili Trawangan", "Gili Air"] as const;
type AiEnabledSedeName = (typeof AI_ENABLED_SEDE_NAMES)[number];

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

    // V2 fallback: Respond.io v2 webhooks omit customFields, so Branch is
    // unavailable in the payload. Use the locked WhatsApp channel id
    // instead — channel 274637 defaults to Gili Trawangan (the original
    // pilot sede) when we can't tell from anything else. GA contacts on
    // the v2 webhook path must rely on Branch being set; we do NOT guess
    // GA from channel because there's no unique channel for it yet.
    if (channelId && channelId === PILOT_WHATSAPP_CHANNEL_ID) {
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
