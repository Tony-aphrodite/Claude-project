import { describe, expect, it } from "vitest";

import {
  isImageMime,
  isPdfMime,
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
