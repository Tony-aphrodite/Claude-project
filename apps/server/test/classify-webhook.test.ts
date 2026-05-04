import { describe, expect, it } from "vitest";

import { classifyWebhook, type RespondIoIncomingMessage } from "@dpm/shared";

function payload(
  partial: Partial<RespondIoIncomingMessage> & {
    message?: Partial<RespondIoIncomingMessage["message"]>;
  } = {},
): RespondIoIncomingMessage {
  return {
    event: "message.created",
    contact: { id: "c1", tags: [], ...partial.contact },
    message: { type: "text", text: "hola", ...partial.message },
    ...partial,
  } as RespondIoIncomingMessage;
}

describe("classifyWebhook", () => {
  it("treats a missing direction as client_inbound (back-compat)", () => {
    expect(classifyWebhook(payload())).toEqual({ kind: "client_inbound" });
  });

  it("classifies outgoing + agent as agent_outbound", () => {
    const v = classifyWebhook(
      payload({
        direction: "outgoing",
        message: { type: "text", text: "Te mando el link", sentBy: { type: "agent", name: "Grecia" } },
      }),
    );
    expect(v).toEqual({ kind: "agent_outbound", agentName: "Grecia" });
  });

  it("classifies outgoing + user (alt sender type) as agent_outbound", () => {
    const v = classifyWebhook(
      payload({
        direction: "outgoing",
        message: { type: "text", text: "ok", sender: { type: "user", name: "Patrick" } },
      }),
    );
    expect(v).toEqual({ kind: "agent_outbound", agentName: "Patrick" });
  });

  it("classifies outgoing + bot as bot_outbound (drop, do not double-store)", () => {
    const v = classifyWebhook(
      payload({
        direction: "outgoing",
        message: { type: "text", text: "Hola, soy DPM!", sentBy: { type: "bot" } },
      }),
    );
    expect(v).toEqual({ kind: "bot_outbound" });
  });

  it("classifies outgoing without a sentBy as bot_outbound (defensive)", () => {
    const v = classifyWebhook(
      payload({ direction: "outgoing", message: { type: "text", text: "x" } }),
    );
    expect(v).toEqual({ kind: "bot_outbound" });
  });

  it("ignores empty / whitespace-only text", () => {
    expect(classifyWebhook(payload({ message: { type: "text", text: "" } }))).toEqual({
      kind: "ignored",
      reason: "non_text",
    });
    expect(classifyWebhook(payload({ message: { type: "text", text: "   " } }))).toEqual({
      kind: "ignored",
      reason: "non_text",
    });
  });

  it("falls back to message.direction when top-level direction is absent", () => {
    const v = classifyWebhook(
      payload({
        message: {
          type: "text",
          text: "hola",
          direction: "outgoing",
          sentBy: { type: "agent", name: "Giovanni" },
        },
      }),
    );
    expect(v).toEqual({ kind: "agent_outbound", agentName: "Giovanni" });
  });

  it("returns agentName=null when an agent message lacks the name field", () => {
    const v = classifyWebhook(
      payload({
        direction: "outgoing",
        message: { type: "text", text: "ok", sentBy: { type: "agent" } },
      }),
    );
    expect(v).toEqual({ kind: "agent_outbound", agentName: null });
  });
});
