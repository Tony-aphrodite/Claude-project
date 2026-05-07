// ============================================================================
// Respond.io attachment normalizer.
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
