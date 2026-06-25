import { describe, expect, it } from "vitest";

import {
  isImageMime,
  isPdfMime,
  pickAllAttachments,
  pickFirstAttachment,
} from "../src/services/respond-io-attachment.js";

describe("pickFirstAttachment — Respond.io payload variants", () => {
  it("picks from attachments[] with mimeType", () => {
    const a = pickFirstAttachment({
      attachments: [{ url: "https://x/y.jpg", mimeType: "image/jpeg" }],
    });
    expect(a).toEqual({ url: "https://x/y.jpg", mimeType: "image/jpeg" });
  });

  it("picks from attachments[] with snake_case mime_type", () => {
    const a = pickFirstAttachment({
      attachments: [{ link: "https://x/y.pdf", mime_type: "application/pdf" }],
    });
    expect(a).toEqual({ url: "https://x/y.pdf", mimeType: "application/pdf" });
  });

  it("picks from singular attachment field", () => {
    const a = pickFirstAttachment({
      attachment: { fileUrl: "https://x/y.png", contentType: "image/png" },
    });
    expect(a).toEqual({ url: "https://x/y.png", mimeType: "image/png" });
  });

  it("returns null when no attachment fields present", () => {
    expect(pickFirstAttachment({})).toBe(null);
    expect(pickFirstAttachment({ attachments: [] })).toBe(null);
    expect(pickFirstAttachment({ attachments: [{ random: "foo" }] })).toBe(null);
  });

  it("prefers attachments[] over the singular field", () => {
    const a = pickFirstAttachment({
      attachments: [{ url: "https://array/" }],
      attachment: { url: "https://singular/" },
    });
    expect(a?.url).toBe("https://array/");
  });

  it("handles missing mime gracefully", () => {
    const a = pickFirstAttachment({ attachment: { url: "https://x/y" } });
    expect(a).toEqual({ url: "https://x/y", mimeType: null });
  });
});

describe("pickAllAttachments — multi-image batch coalescing", () => {
  it("returns every entry in attachments[] preserving order", () => {
    const arr = pickAllAttachments({
      attachments: [
        { url: "https://x/a.jpg", mimeType: "image/jpeg" },
        { url: "https://x/b.png", mime_type: "image/png" },
        { link: "https://x/c.pdf", contentType: "application/pdf" },
      ],
    });
    expect(arr).toHaveLength(3);
    expect(arr[0]!.url).toBe("https://x/a.jpg");
    expect(arr[2]!.mimeType).toBe("application/pdf");
  });

  it("appends the singular `attachment` field after the array", () => {
    const arr = pickAllAttachments({
      attachments: [{ url: "https://x/array.jpg", mimeType: "image/jpeg" }],
      attachment: { url: "https://x/single.png", mimeType: "image/png" },
    });
    expect(arr.map((a) => a.url)).toEqual([
      "https://x/array.jpg",
      "https://x/single.png",
    ]);
  });

  it("deduplicates by URL across array + singular", () => {
    const arr = pickAllAttachments({
      attachments: [{ url: "https://x/dup.jpg", mimeType: "image/jpeg" }],
      attachment: { url: "https://x/dup.jpg", mimeType: "image/jpeg" },
    });
    expect(arr).toHaveLength(1);
  });

  it("returns an empty array when no attachments are present", () => {
    expect(pickAllAttachments({})).toEqual([]);
    expect(pickAllAttachments({ attachments: [] })).toEqual([]);
    expect(pickAllAttachments({ attachments: [{ random: "x" }] })).toEqual([]);
  });

  it("handles missing mime gracefully across entries", () => {
    const arr = pickAllAttachments({
      attachments: [
        { url: "https://x/a" },
        { url: "https://x/b", mimeType: "image/png" },
      ],
    });
    expect(arr).toHaveLength(2);
    expect(arr[0]!.mimeType).toBe(null);
    expect(arr[1]!.mimeType).toBe("image/png");
  });
});

describe("mime helpers", () => {
  it("detects image mimes", () => {
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("IMAGE/PNG")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime(null)).toBe(false);
  });

  it("detects pdf mimes", () => {
    expect(isPdfMime("application/pdf")).toBe(true);
    expect(isPdfMime("application/x-pdf")).toBe(true);
    expect(isPdfMime("image/png")).toBe(false);
    expect(isPdfMime(null)).toBe(false);
  });
});
