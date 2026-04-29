import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { pickSignatureHeader, verifySignature } from "../src/lib/hmac.js";

const SECRET = "test-secret-12345";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("verifySignature", () => {
  it("accepts a correct sha256= prefixed signature", () => {
    const body = '{"event":"message.created"}';
    const header = `sha256=${sign(body)}`;
    expect(verifySignature(body, header, SECRET)).toEqual({ ok: true });
  });

  it("accepts a bare hex digest (legacy format)", () => {
    const body = '{"event":"message.created"}';
    const header = sign(body);
    expect(verifySignature(body, header, SECRET)).toEqual({ ok: true });
  });

  it("rejects a missing header", () => {
    expect(verifySignature("{}", undefined, SECRET)).toEqual({
      ok: false,
      reason: "missing_header",
    });
  });

  it("rejects non-hex content", () => {
    expect(verifySignature("{}", "sha256=NOT_HEX_!!!", SECRET)).toEqual({
      ok: false,
      reason: "bad_format",
    });
  });

  it("rejects a tampered body", () => {
    const body = '{"event":"message.created"}';
    const tampered = '{"event":"message.created","extra":1}';
    const header = `sha256=${sign(body)}`;
    expect(verifySignature(tampered, header, SECRET)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a wrong secret", () => {
    const body = "hello";
    const header = `sha256=${createHmac("sha256", "other-secret").update(body).digest("hex")}`;
    expect(verifySignature(body, header, SECRET)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("handles Buffer body input", () => {
    const body = Buffer.from('{"x":1}', "utf8");
    const header = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    expect(verifySignature(body, header, SECRET)).toEqual({ ok: true });
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
