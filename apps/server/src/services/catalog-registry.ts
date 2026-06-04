// ============================================================================
// Per-sede catalog registry. Maps a canonical program key (TryScuba, OW, …)
// to whatever identifier Respond.io / Meta WhatsApp Business uses to send
// the corresponding native product card. The exact identifier depends on
// how Miguel's catalogs are registered:
//
//   • If they're plain WhatsApp Business Catalog products: it's the
//     `product_retailer_id` (the SKU set in Meta Commerce Manager).
//   • If they're Respond.io "approved templates" with media: it's the
//     template name plus optional language code.
//   • If they're Respond.io content snippets ("Fragmentos"): it's the
//     fragment ID.
//
// We don't lock to one shape — the registry stores the raw payload that
// `respond-io.ts` will forward to the API as-is. The shape Miguel confirms
// (after he sends a sample) gets baked into env vars and loaded here.
//
// Naming convention for env vars:
//
//   RESPOND_IO_CATALOG_<SEDE>_<PROGRAM>[_<LANG>]=<json-or-string>
//
// The optional `<LANG>` suffix (e.g. _EN, _ES) lets a sede maintain
// separate catalog cards per language. The lookup tries language-suffixed
// variants in order (caller's language → EN fallback → bare key) so adding
// language support per-sede is opt-in: sedes that only have one variant
// can keep using the unsuffixed env var.
//
// Example for Phi Phi, Try Scuba, bilingual fragments (added 2026-06-02):
//
//   RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_EN=xini7rpxbl
//   RESPOND_IO_CATALOG_KOH_PHI_PHI_TRYSCUBA_ES=ysjbu87ht6
//
// Example for Gili Trawangan, Open Water, Meta product retailer ID (no lang):
//
//   RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW='{"type":"product","product_retailer_id":"OW-GILI-EN"}'
//
// or simpler legacy form if it's just a fragment id:
//
//   RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW=frag_OW_gili
//
// Either way the value is opaque to this server — we hand it off to
// Respond.io's API. We accept both (string for fragment, JSON for richer
// payloads).
// ============================================================================

import type { CatalogProgram } from "@dpm/shared";

export type CatalogPayload =
  | { type: "fragment"; fragmentId: string }
  | { type: "product"; product_retailer_id: string; catalog_id?: string }
  | {
      type: "template";
      name: string;
      language: string;
      components?: unknown[];
    }
  | {
      type: "image";
      url: string;
      mimeType?: string;
    }
  | { type: "raw"; payload: Record<string, unknown> };

export type CatalogEntry = {
  /** Stable human-readable label used in audit logs and panel. */
  label: string;
  /** Forwarded to Respond.io's API by sendCatalogMessage. */
  payload: CatalogPayload;
};

/** Normalize a sede name to the env-var segment we use. */
function sedeKey(sedeName: string): string {
  return sedeName
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function envKey(sedeName: string, program: CatalogProgram, langSuffix?: string): string {
  const base = `RESPOND_IO_CATALOG_${sedeKey(sedeName)}_${program.toUpperCase()}`;
  return langSuffix ? `${base}_${langSuffix}` : base;
}

/**
 * Normalize a customer-language code to the suffix used in env-var names.
 * Accepts ISO codes ("en", "es", "en-US", "es-AR"), language names
 * ("english", "español"), and our internal labels. Anything else returns
 * undefined, which signals "no language-specific lookup, fall back to base".
 */
function langSuffixFor(language: string | null | undefined): "EN" | "ES" | undefined {
  if (!language) return undefined;
  const lower = language.toLowerCase().trim();
  if (lower.startsWith("en") || lower === "english") return "EN";
  if (lower.startsWith("es") || lower === "español" || lower === "espanol" || lower === "spanish") return "ES";
  return undefined;
}

/**
 * Look up the catalog entry for a given (sede, program) pair. Returns null
 * when no entry is configured — the tool handler must degrade gracefully
 * (the AI then answers in text only).
 *
 * The optional `language` argument enables per-language catalog cards:
 * we try the language-suffixed env var first
 * (`..._EN` / `..._ES`), then fall back to `..._EN` (so Spanish customers
 * still get a card when only EN was configured), then the bare unsuffixed
 * key. This keeps legacy single-language sedes working unchanged while
 * allowing sedes like Phi Phi (Miguel 2026-06-02) to ship bilingual
 * fragments.
 */
export function getCatalogEntry(
  sedeName: string,
  program: CatalogProgram,
  language?: string | null,
): CatalogEntry | null {
  const suffix = langSuffixFor(language);

  // Lookup order: customer-language → EN fallback → bare key.
  // Deduplicate so we don't read the same env var twice when suffix is EN.
  const lookups: string[] = [];
  if (suffix) lookups.push(envKey(sedeName, program, suffix));
  if (!suffix || suffix !== "EN") lookups.push(envKey(sedeName, program, "EN"));
  lookups.push(envKey(sedeName, program));

  let raw: string | undefined;
  for (const key of lookups) {
    const v = process.env[key];
    if (v && v.trim().length > 0) {
      raw = v;
      break;
    }
  }
  if (!raw) return null;

  const trimmed = raw.trim();

  // Try JSON first (richer payload). Fall back to bare-string fragment id.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const type = String(parsed.type ?? "").toLowerCase();

      if (type === "product" && typeof parsed.product_retailer_id === "string") {
        return {
          label: parsed.product_retailer_id as string,
          payload: {
            type: "product",
            product_retailer_id: parsed.product_retailer_id as string,
            ...(typeof parsed.catalog_id === "string"
              ? { catalog_id: parsed.catalog_id as string }
              : {}),
          },
        };
      }
      if (
        type === "template" &&
        typeof parsed.name === "string" &&
        typeof parsed.language === "string"
      ) {
        return {
          label: parsed.name as string,
          payload: {
            type: "template",
            name: parsed.name as string,
            language: parsed.language as string,
            ...(Array.isArray(parsed.components)
              ? { components: parsed.components as unknown[] }
              : {}),
          },
        };
      }
      // Anything else: forward verbatim.
      return {
        label: typeof parsed.label === "string" ? (parsed.label as string) : "raw",
        payload: { type: "raw", payload: parsed },
      };
    } catch {
      // Malformed JSON in the env var. The describeMissingCatalog helper
      // surfaces the var name to the operator on the next AI call, so we
      // intentionally don't log here (avoids depending on logger init,
      // which trips test contexts that don't load env first).
      return null;
    }
  }

  // Bare URL → treat as Respond.io image attachment (2026-06-04 Miguel fix).
  // Native WhatsApp catalog product cards aren't reachable via Respond.io
  // public API (see memory: respondio_catalog_send_limitation). Instead,
  // each program env var holds a Cloudinary image URL (the catalog image
  // with price + inclusions baked in). The send path posts it as an
  // attachment type=image so WhatsApp renders it inline — no click-out,
  // no link rendering, no Meta template approval needed.
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      label: trimmed,
      payload: { type: "image", url: trimmed, mimeType: "image/jpeg" },
    };
  }

  // Bare string → treat as Respond.io fragment id.
  return {
    label: trimmed,
    payload: { type: "fragment", fragmentId: trimmed },
  };
}

/** Diagnostic helper used by the tool handler when nothing is configured. */
export function describeMissingCatalog(
  sedeName: string,
  program: CatalogProgram,
): string {
  return `Catalog not configured for ${sedeName}/${program} — set ${envKey(
    sedeName,
    program,
  )} in the server env.`;
}
