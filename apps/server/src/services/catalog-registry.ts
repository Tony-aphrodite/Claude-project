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
//   RESPOND_IO_CATALOG_<SEDE>_<PROGRAM>=<json-or-string>
//
// Example for Gili Trawangan, Open Water, Meta product retailer ID:
//
//   RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW='{"type":"product","product_retailer_id":"OW-GILI-EN"}'
//
// or simpler legacy form if it's just a fragment id:
//
//   RESPOND_IO_CATALOG_GILI_TRAWANGAN_OW=frag_OW_gili
//
// Either way the value is opaque to this server — we hand it off to
// Respond.io's API. Until Miguel confirms the actual format, we accept
// both (string for fragment, JSON for richer payloads).
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

function envKey(sedeName: string, program: CatalogProgram): string {
  return `RESPOND_IO_CATALOG_${sedeKey(sedeName)}_${program.toUpperCase()}`;
}

/**
 * Look up the catalog entry for a given (sede, program) pair. Returns null
 * when no entry is configured — the tool handler must degrade gracefully
 * (the AI then answers in text only).
 */
export function getCatalogEntry(
  sedeName: string,
  program: CatalogProgram,
): CatalogEntry | null {
  const key = envKey(sedeName, program);
  const raw = process.env[key];
  if (!raw || raw.trim().length === 0) return null;

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
