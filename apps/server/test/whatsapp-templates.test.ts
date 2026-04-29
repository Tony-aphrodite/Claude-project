import { describe, expect, it } from "vitest";

import {
  isWithin24hWindow,
  pickTemplate,
} from "../src/services/whatsapp-templates.js";

describe("isWithin24hWindow", () => {
  it("returns false when no last message", () => {
    expect(isWithin24hWindow(null)).toBe(false);
    expect(isWithin24hWindow(undefined)).toBe(false);
  });
  it("returns true within 24h", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(isWithin24hWindow(oneHourAgo)).toBe(true);
  });
  it("returns false past 24h", () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isWithin24hWindow(yesterday)).toBe(false);
  });
});

describe("pickTemplate", () => {
  it("picks a Spanish template at level 3", () => {
    const t = pickTemplate(3, "es");
    expect(t).not.toBeNull();
    expect(t!.language).toBe("es");
    expect(t!.followUpLevel).toBe(3);
  });
  it("falls back to English for unknown languages", () => {
    const t = pickTemplate(4, "ja");
    expect(t).not.toBeNull();
    expect(t!.language).toBe("en");
  });
  it("returns null for an unconfigured level", () => {
    // @ts-expect-error — level 1 has no template (free-form only)
    const t = pickTemplate(1, "es");
    expect(t).toBeNull();
  });
});
