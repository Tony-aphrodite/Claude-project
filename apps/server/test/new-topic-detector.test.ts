import { describe, expect, it } from "vitest";

import { isNewTopicAfterHandoff } from "../src/services/new-topic-detector.js";

const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
const ONE_MIN_AGO = new Date(Date.now() - 60 * 1000);

describe("isNewTopicAfterHandoff", () => {
  it("returns false for short messages (thanks/ok/👍)", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "ok",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(false);
    expect(
      isNewTopicAfterHandoff({
        text: "gracias!",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(false);
    expect(
      isNewTopicAfterHandoff({
        text: "👍",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(false);
  });

  it("returns false when no intent keyword present", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Recibí la confirmación, todo bien, gracias!",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(false);
  });

  it("returns false within 15 min of handoff (avoid waking AI on quick reply)", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Quiero hacer un night dive el sábado, tengo el Advanced",
        leadStageChangedAt: ONE_MIN_AGO,
      }),
    ).toBe(false);
  });

  // 2026-05-12 — exact Miguel scenario: 30+ min after deposit, asks about
  // another service. AI should re-engage.
  it("returns true on Spanish night-dive inquiry after handoff (Miguel scenario)", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Quiero hacer un night dive el sábado, tengo el Advanced",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(true);
  });

  it("returns true on English new-topic inquiry", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Hi, do you also offer fun dives for the day after?",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(true);
  });

  it("returns true on price question (intent keyword: cuánto)", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Una consulta — ¿cuánto sale el Advanced para una persona?",
        leadStageChangedAt: ONE_HOUR_AGO,
      }),
    ).toBe(true);
  });

  it("returns true when leadStageChangedAt is null (no recency check)", () => {
    expect(
      isNewTopicAfterHandoff({
        text: "Quiero hacer otra reserva para mi amigo",
        leadStageChangedAt: null,
      }),
    ).toBe(true);
  });
});
