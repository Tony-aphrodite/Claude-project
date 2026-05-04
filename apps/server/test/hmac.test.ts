import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { pickSignatureHeader, verifySignature } from "../src/lib/hmac.js";

const SECRET = "test-secret-12345";
// Realistic Respond.io secret: a base64-encoded 32-byte HMAC key.
const B64_SECRET = Buffer.from("32-byte-respond-io-secret-______").toString("base64");

function signHex(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifySignature — hex (legacy)", () => {
  it("accepts a correct sha256= prefixed signature", () => {
    const body = '{"event":"message.created"}';
    const header = `sha256=${signHex(body)}`;
    expect(verifySignature(body, header, SECRET)).toEqual({
      ok: true,
      matched: "hex",
    });
  });

  it("accepts a bare hex digest", () => {
    const body = '{"event":"message.created"}';
    const header = signHex(body);
    expect(verifySignature(body, header, SECRET)).toEqual({
      ok: true,
      matched: "hex",
    });
  });

  it("handles Buffer body input", () => {
    const body = Buffer.from('{"x":1}', "utf8");
    const header = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    expect(verifySignature(body, header, SECRET)).toEqual({
      ok: true,
      matched: "hex",
    });
  });

  it("rejects a tampered body (hex)", () => {
    const body = '{"event":"message.created"}';
    const tampered = '{"event":"message.created","extra":1}';
    const header = `sha256=${signHex(body)}`;
    expect(verifySignature(tampered, header, SECRET)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a wrong secret (hex)", () => {
    const body = "hello";
    const header = `sha256=${signHex(body, "other-secret")}`;
    expect(verifySignature(body, header, SECRET)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });
});

describe("verifySignature — Respond.io base64", () => {
  it("accepts base64 signature when secret is itself base64", () => {
    const body = '{"event":"message.created"}';
    const keyBytes = Buffer.from(B64_SECRET, "base64");
    const headerB64 = createHmac("sha256", keyBytes).update(body).digest("base64");
    expect(verifySignature(body, headerB64, B64_SECRET)).toEqual({
      ok: true,
      matched: "respond-io-base64",
    });
  });

  it("accepts base64 signature when secret is supplied as raw string", () => {
    const body = '{"event":"x"}';
    const headerB64 = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifySignature(body, headerB64, SECRET)).toEqual({
      ok: true,
      matched: "respond-io-base64",
    });
  });

  it("tolerates a tampered body in base64 mode", () => {
    const body = '{"event":"x"}';
    const headerB64 = createHmac("sha256", B64_SECRET).update(body).digest("base64");
    expect(verifySignature("{}", headerB64, B64_SECRET)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });
});

describe("verifySignature — error paths", () => {
  it("rejects a missing header", () => {
    expect(verifySignature("{}", undefined, SECRET)).toEqual({
      ok: false,
      reason: "missing_header",
    });
  });

  it("rejects content that is neither hex nor base64", () => {
    expect(verifySignature("{}", "!!!nothex_or_b64!!!", SECRET)).toEqual({
      ok: false,
      reason: "bad_format",
    });
  });
});

describe("pickSignatureHeader", () => {
  it("prefers x-respond-signature", () => {
    expect(
      pickSignatureHeader({
        "x-respond-signature": "abc",
        "x-respond-io-signature": "xyz",
      }),
    ).toBe("abc");
  });

  it("falls back to x-respond-io-signature", () => {
    expect(pickSignatureHeader({ "x-respond-io-signature": "xyz" })).toBe("xyz");
  });

  it("returns undefined when no candidate header is present", () => {
    expect(pickSignatureHeader({ "content-type": "application/json" })).toBeUndefined();
  });
});
