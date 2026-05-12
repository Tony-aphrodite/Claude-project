import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  authenticateWebhook,
  pickSignatureHeader,
  pickWorkflowTokenHeader,
  verifySignature,
} from "../src/lib/hmac.js";

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

describe("pickWorkflowTokenHeader", () => {
  it("returns the x-workflow-token header value when present", () => {
    expect(
      pickWorkflowTokenHeader({ "x-workflow-token": "abc123" }),
    ).toBe("abc123");
  });

  it("returns the first element when header arrives as an array", () => {
    expect(
      pickWorkflowTokenHeader({ "x-workflow-token": ["first", "second"] }),
    ).toBe("first");
  });

  it("returns undefined when header is missing", () => {
    expect(pickWorkflowTokenHeader({})).toBeUndefined();
    expect(pickWorkflowTokenHeader({ "x-workflow-token": "" })).toBeUndefined();
  });
});

describe("authenticateWebhook — token-first path", () => {
  const TOKEN = "this-is-a-long-shared-token-32chars";
  const body = '{"event":"x"}';

  it("accepts when token matches and configured token is non-empty", () => {
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: undefined,
        tokenHeader: TOKEN,
        hmacSecret: SECRET,
        workflowToken: TOKEN,
      }),
    ).toEqual({ ok: true, matched: "workflow-token" });
  });

  it("falls back to HMAC when token is presented but does not match", () => {
    const sig = `sha256=${signHex(body)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: sig,
        tokenHeader: "wrong-token",
        hmacSecret: SECRET,
        workflowToken: TOKEN,
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("falls back to HMAC when token feature is disabled (workflowToken empty)", () => {
    const sig = `sha256=${signHex(body)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: sig,
        tokenHeader: TOKEN, // even with header set, no env token → ignore
        hmacSecret: SECRET,
        workflowToken: undefined,
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("rejects when neither token nor HMAC is valid", () => {
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: undefined,
        tokenHeader: "wrong-token",
        hmacSecret: SECRET,
        workflowToken: TOKEN,
      }),
    ).toEqual({ ok: false, reason: "missing_header" });
  });
});

describe("authenticateWebhook — multi-secret (hmacSecretsExtra)", () => {
  const PRIMARY = "primary-webhook-secret-1234";
  const EXTRA_A = "sync-lifecycle-secret-aaaa-bbbb";
  const EXTRA_B = "sync-assignee-secret-cccc-dddd";
  const EXTRA_C = "sync-tags-secret-eeee-ffff";
  const body = '{"event":"contact.tag.updated"}';

  it("accepts a request signed with the primary secret", () => {
    const header = `sha256=${signHex(body, PRIMARY)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [EXTRA_A, EXTRA_B, EXTRA_C],
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("accepts a request signed with the first extra secret", () => {
    const header = `sha256=${signHex(body, EXTRA_A)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [EXTRA_A, EXTRA_B, EXTRA_C],
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("accepts a request signed with the last extra secret", () => {
    const header = `sha256=${signHex(body, EXTRA_C)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [EXTRA_A, EXTRA_B, EXTRA_C],
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("rejects when none of primary or extras match", () => {
    const header = `sha256=${signHex(body, "wrong-secret-not-in-list")}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [EXTRA_A, EXTRA_B, EXTRA_C],
      }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("skips empty entries in extras (no crash, no false-accept)", () => {
    const header = `sha256=${signHex(body, EXTRA_B)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: ["", EXTRA_B, ""],
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });

  it("does not try extras when primary returns missing_header (short-circuit)", () => {
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: undefined,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [EXTRA_A, EXTRA_B, EXTRA_C],
      }),
    ).toEqual({ ok: false, reason: "missing_header" });
  });

  it("behaves identically to single-secret mode when extras is empty", () => {
    const header = `sha256=${signHex(body, PRIMARY)}`;
    expect(
      authenticateWebhook({
        rawBody: body,
        signatureHeader: header,
        tokenHeader: undefined,
        hmacSecret: PRIMARY,
        hmacSecretsExtra: [],
      }),
    ).toEqual({ ok: true, matched: "hex" });
  });
});
