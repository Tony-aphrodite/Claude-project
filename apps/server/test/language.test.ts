import { describe, expect, it } from "vitest";

import { detectLanguage, languageLabelToIso2 } from "../src/services/language.js";

describe("detectLanguage — scrub non-conversational tokens before franc-min", () => {
  it("returns undefined for short text (< 60 chars after scrub)", () => {
    expect(detectLanguage("Hola")).toBeUndefined();
    expect(detectLanguage("Quiero info de OW")).toBeUndefined();
  });

  it("detects Spanish from a real customer message of 60+ chars", () => {
    const msg =
      "Hola, quería información sobre el Open Water para el 18 de mayo, somos 2 personas y venimos desde Bali.";
    expect(detectLanguage(msg)).toBe("español");
  });

  // 2026-05-12 regression — Miguel's drag-drop in WhatsApp Web sent a
  // text message containing the file URL `file:///C:/Users/.../virement-de-bertrand-klein.pdf`.
  // franc picked Portuguese from the `virement` French token + path noise,
  // and the AI replied "Obrigado pelo comprovante!". After the scrub, the
  // message either resolves to español or falls back to undefined — never
  // português.
  it("does NOT pick Portuguese on a Spanish lead-in + Windows file path", () => {
    const msg =
      "NO NINGUNA DUDA. file:///C:/Users/DPM/OneDrive/Desktop/46efe582cb5eff8ac9f19eca244cf9652026-05-07_virement-de-bertrand-klein.pdf";
    const detected = detectLanguage(msg);
    expect(detected).not.toBe("português");
  });

  it("strips https URLs, https-URLs and standalone .pdf filenames", () => {
    const msg =
      "Te paso el comprobante por aquí: https://wise.com/account/transfer/123 — el archivo es virement-de-bertrand.pdf y también lo subí a https://drive.google.com/file/d/abc.";
    const detected = detectLanguage(msg);
    expect(detected).toBe("español");
  });

  it("falls back to undefined when only URL/path remains after scrub", () => {
    const msg =
      "file:///C:/Users/DPM/Desktop/virement-de-bertrand-klein.pdf https://wise.com/transfer/abc";
    expect(detectLanguage(msg)).toBeUndefined();
  });
});

describe("languageLabelToIso2", () => {
  it("maps the three production labels", () => {
    expect(languageLabelToIso2("español")).toBe("es");
    expect(languageLabelToIso2("english")).toBe("en");
    expect(languageLabelToIso2("português")).toBe("pt");
  });

  it("handles case + null/undefined safely", () => {
    expect(languageLabelToIso2("ESPAÑOL")).toBe("es");
    expect(languageLabelToIso2(null)).toBeNull();
    expect(languageLabelToIso2(undefined)).toBeNull();
    expect(languageLabelToIso2("klingon")).toBeNull();
  });
});
