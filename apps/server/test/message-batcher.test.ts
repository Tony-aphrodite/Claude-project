// Batcher behaviour around attachments — Miguel 2026-06-25 fix.
//
// Before: a customer sending 10 images in a row produced 10 AI replies
// because attachments bypassed the batcher and each one fired its own
// processIncomingMessage. After: attachments go through the batcher and
// land in ONE merged payload whose `attachments[]` contains every image.
//
// We exercise the public surface (isBatchEligible + enqueueOrBatch) rather
// than poking the private mergePayloads, so the contract under test is what
// the webhook route sees.

import { describe, expect, it } from "vitest";

import {
  enqueueOrBatch,
  flushAll,
  isBatchEligible,
  isDuplicateMessageId,
} from "../src/services/message-batcher.js";

// Minimal logger shape — the batcher only calls .info / .error / .warn.
function makeLog() {
  const calls: Array<{ level: string; obj: unknown; msg: string }> = [];
  const push = (level: string) => (obj: unknown, msg?: unknown) =>
    calls.push({ level, obj, msg: typeof msg === "string" ? msg : "" });
  return {
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    debug: push("debug"),
    fatal: push("fatal"),
    trace: push("trace"),
    silent: push("silent"),
    child() {
      return this;
    },
    level: "info",
    levelVal: 30,
    bindings() {
      return {};
    },
    isLevelEnabled() {
      return true;
    },
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function mkContactId(): string {
  return `contact-${Math.floor(Math.random() * 1_000_000)}`;
}

function imagePayload(opts: {
  contactId: string;
  url: string;
  mime?: string;
  text?: string;
  messageId?: string;
}) {
  return {
    contact: { id: opts.contactId, customFields: [], tags: [] },
    channelId: 999,
    message: {
      text: opts.text ?? "",
      attachments: [{ url: opts.url, mimeType: opts.mime ?? "image/jpeg" }],
      attachment: undefined,
      messageId: opts.messageId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    conversation: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function textPayload(opts: { contactId: string; text: string }) {
  return {
    contact: { id: opts.contactId, customFields: [], tags: [] },
    channelId: 999,
    message: {
      text: opts.text,
      attachments: [],
      attachment: undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    conversation: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("isBatchEligible — attachment messages now batch", () => {
  it("returns true for image-only messages (Miguel 2026-06-25 fix)", () => {
    expect(
      isBatchEligible(
        imagePayload({ contactId: "c1", url: "https://x/a.jpg" }),
      ),
    ).toBe(true);
  });

  it("returns true for text + attachment combos", () => {
    expect(
      isBatchEligible(
        imagePayload({
          contactId: "c2",
          url: "https://x/b.jpg",
          text: "qué foto",
        }),
      ),
    ).toBe(true);
  });

  it("returns true for plain text", () => {
    expect(isBatchEligible(textPayload({ contactId: "c3", text: "Hola" }))).toBe(
      true,
    );
  });

  it("returns false for empty payloads (no text, no attachment)", () => {
    expect(
      isBatchEligible(textPayload({ contactId: "c4", text: "" })),
    ).toBe(false);
  });

  it("returns false for sede-selector button clicks (text === sede name)", () => {
    // The exact list lives in services/sede.ts; "Gili Air" is a known
    // AI-enabled sede name. Empty-attachment text payload that happens
    // to equal a sede name must NOT be batched.
    expect(
      isBatchEligible(textPayload({ contactId: "c5", text: "Gili Air" })),
    ).toBe(false);
  });
});

describe("enqueueOrBatch + mergePayloads — multi-image coalescing", () => {
  it("merges N image bursts into ONE processor call carrying every attachment", async () => {
    const contactId = mkContactId();
    const log = makeLog();
    const merged: unknown[] = [];
    const processor = async (payload: unknown) => {
      merged.push(payload);
    };

    // 5 images arriving in rapid succession.
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/1.jpg" }),
      log,
      processor,
    );
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/2.jpg", mime: "image/png" }),
      log,
      processor,
    );
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/3.jpg" }),
      log,
      processor,
    );
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/4.pdf", mime: "application/pdf" }),
      log,
      processor,
    );
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/5.jpg" }),
      log,
      processor,
    );

    // Force-fire instead of waiting the full 5s debounce.
    flushAll(processor);
    // flushAll schedules the call synchronously via fireBatch → processor;
    // give the microtask queue one tick to settle.
    await new Promise((r) => setImmediate(r));

    expect(merged).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = merged[0]! as any;
    expect(m.contact.id).toBe(contactId);
    expect(m.message.attachments).toHaveLength(5);
    expect(m.message.attachments.map((a: { url: string }) => a.url)).toEqual([
      "https://x/1.jpg",
      "https://x/2.jpg",
      "https://x/3.jpg",
      "https://x/4.pdf",
      "https://x/5.jpg",
    ]);
  });

  it("merges a mixed text + image burst into one payload with concatenated text and the image attached", async () => {
    const contactId = mkContactId();
    const log = makeLog();
    const merged: unknown[] = [];
    const processor = async (payload: unknown) => {
      merged.push(payload);
    };

    enqueueOrBatch(textPayload({ contactId, text: "Mira esto" }), log, processor);
    enqueueOrBatch(
      imagePayload({ contactId, url: "https://x/photo.jpg", text: "" }),
      log,
      processor,
    );
    enqueueOrBatch(
      textPayload({ contactId, text: "lo encontré ayer" }),
      log,
      processor,
    );

    flushAll(processor);
    await new Promise((r) => setImmediate(r));

    expect(merged).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = merged[0]! as any;
    expect(m.message.text).toBe("Mira esto\n\nlo encontré ayer");
    expect(m.message.attachments).toHaveLength(1);
    expect(m.message.attachments[0]!.url).toBe("https://x/photo.jpg");
  });
});

describe("isDuplicateMessageId — Respond.io fan-out dedup", () => {
  it("returns false for an unseen id then true for the same id", () => {
    const id = `wamid.${Math.random()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = {
      message: { messageId: id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(isDuplicateMessageId(payload)).toBe(false);
    expect(isDuplicateMessageId(payload)).toBe(true);
  });

  it("never dedupes when messageId is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = { message: {} } as any;
    expect(isDuplicateMessageId(payload)).toBe(false);
    expect(isDuplicateMessageId(payload)).toBe(false);
  });
});
