// ============================================================================
// Respond.io attachment normalizer + shared base64 fetcher.
//
// The webhook payload shape for attached files depends on the upstream
// Meta/WhatsApp channel + the Respond.io API version. We've observed at
// least four spellings in the wild:
//
//   message.attachments[]:   { url, mimeType }
//   message.attachments[]:   { link, type }
//   message.attachment:      { url, mime_type }
//   message.attachments[]:   { fileUrl, contentType }
//
// Rather than chase every variant, we accept arbitrary objects in the schema
// (passthrough()) and pick fields here. Returns null when no usable
// attachment is present so the caller can fall back gracefully.
//
// `pickAllAttachments` was added 2026-06-25 (Miguel image-handling feedback):
// the batcher now coalesces multi-image bursts, and the chat path now sends
// images to Claude as vision blocks, so callers need every attachment, not
// just the first.
//
// `fetchAttachmentAsBase64` lives here (previously in ocr-comprobante.ts) so
// both the OCR pipeline and the regular chat path share the same fetch +
// size-cap logic.
// ============================================================================

export type NormalizedAttachment = {
  url: string;
  mimeType: string | null;
};

type AttachmentLike = Record<string, unknown> | undefined;

function pickString(o: AttachmentLike, keys: string[]): string | null {
  if (!o) return null;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function normalizeOne(raw: AttachmentLike): NormalizedAttachment | null {
  if (!raw) return null;
  const url = pickString(raw, ["url", "link", "fileUrl", "file_url", "src"]);
  if (!url) return null;
  const mimeType = pickString(raw, ["mimeType", "mime_type", "contentType", "content_type", "type"]);
  return { url, mimeType };
}

/**
 * Pick the first usable attachment from a Respond.io message envelope.
 * Order: `attachments[0]` (array form) → `attachment` (singular form). When
 * none of them carry a URL, returns null.
 */
export function pickFirstAttachment(message: {
  attachments?: ReadonlyArray<Record<string, unknown>>;
  attachment?: Record<string, unknown>;
}): NormalizedAttachment | null {
  if (Array.isArray(message.attachments)) {
    for (const a of message.attachments) {
      const norm = normalizeOne(a);
      if (norm) return norm;
    }
  }
  return normalizeOne(message.attachment);
}

/**
 * Pick every usable attachment from a Respond.io message envelope. Used by:
 *   - the batcher when coalescing a multi-image burst,
 *   - the chat path when forwarding images to Claude as vision blocks.
 *
 * Preserves array order; the singular `attachment` field is appended last so
 * that a payload carrying both shapes (rare) doesn't lose its array entries.
 * De-duplicates by URL so a payload that double-lists the same file (the
 * merged payload from the batcher can do this when Respond.io re-delivers)
 * doesn't blow up the prompt with the same image twice.
 */
export function pickAllAttachments(message: {
  attachments?: ReadonlyArray<Record<string, unknown>>;
  attachment?: Record<string, unknown>;
}): NormalizedAttachment[] {
  const out: NormalizedAttachment[] = [];
  const seen = new Set<string>();
  if (Array.isArray(message.attachments)) {
    for (const a of message.attachments) {
      const norm = normalizeOne(a);
      if (norm && !seen.has(norm.url)) {
        seen.add(norm.url);
        out.push(norm);
      }
    }
  }
  const single = normalizeOne(message.attachment);
  if (single && !seen.has(single.url)) {
    seen.add(single.url);
    out.push(single);
  }
  return out;
}

/**
 * True when the mime type looks like an image (jpg/png/webp/gif). Used to
 * drive the spec rule "screenshot rejected for foreign currency": image
 * == screenshot, application/pdf == acceptable.
 */
export function isImageMime(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase().startsWith("image/");
}

/**
 * True when the mime type is a PDF. The spec accepts PDF for any currency.
 */
export function isPdfMime(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase().includes("pdf");
}

// ─── Shared base64 fetcher ───────────────────────────────────────────────────

/**
 * Respond.io serves attachments from a pre-signed CDN; we download and
 * base64-encode so we can hand the bytes to Anthropic Vision (both OCR and
 * regular chat use this). Bounded by:
 *
 *   - FETCH_TIMEOUT_MS: avoid hanging on a slow/dead CDN.
 *   - MAX_INLINE_BYTES: Anthropic image payloads cap at 5 MB; 6 MB is the
 *     hard ceiling here, with the caller deciding what to do on overflow.
 *
 * Throws on timeout, non-2xx, or oversize. The chat path catches and skips
 * the offending attachment; OCR returns a `fetch_failed` verdict.
 */
const FETCH_TIMEOUT_MS = 8_000;
const MAX_INLINE_BYTES = 6 * 1024 * 1024;

export type FetchedMedia = {
  bytes: string; // base64
  mimeType: string;
};

export async function fetchAttachmentAsBase64(url: string): Promise<FetchedMedia> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`attachment fetch ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_INLINE_BYTES) {
      throw new Error(`attachment too large (${buf.length} bytes > ${MAX_INLINE_BYTES})`);
    }
    return {
      bytes: buf.toString("base64"),
      mimeType: contentType.split(";")[0]!.trim(),
    };
  } finally {
    clearTimeout(timer);
  }
}
