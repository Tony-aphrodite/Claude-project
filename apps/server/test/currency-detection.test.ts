import { describe, expect, it } from "vitest";

import { detectCurrencyFromPhone } from "../src/services/currency-detection.js";

describe("detectCurrencyFromPhone — owner spec INSTRUCCIONES_PAGO §3", () => {
  it("maps every EUR prefix in the spec", () => {
    expect(detectCurrencyFromPhone("+49301234567")).toBe("EUR"); // Germany
    expect(detectCurrencyFromPhone("+431234567")).toBe("EUR"); // Austria
    expect(detectCurrencyFromPhone("+41123456789")).toBe("EUR"); // Switzerland
    expect(detectCurrencyFromPhone("+33612345678")).toBe("EUR"); // France
    expect(detectCurrencyFromPhone("+34612345678")).toBe("EUR"); // Spain
    expect(detectCurrencyFromPhone("+39312345678")).toBe("EUR"); // Italy
    expect(detectCurrencyFromPhone("+31612345678")).toBe("EUR"); // Netherlands
    expect(detectCurrencyFromPhone("+32412345678")).toBe("EUR"); // Belgium
    expect(detectCurrencyFromPhone("+351912345678")).toBe("EUR"); // Portugal
  });

  it("maps GBP, AUD, IDR, USD", () => {
    expect(detectCurrencyFromPhone("+447712345678")).toBe("GBP");
    expect(detectCurrencyFromPhone("+61412345678")).toBe("AUD");
    expect(detectCurrencyFromPhone("+62812345678901")).toBe("IDR");
    expect(detectCurrencyFromPhone("+14155551234")).toBe("USD");
  });

  it("returns null for prefixes outside the table (forces AI to ask client)", () => {
    expect(detectCurrencyFromPhone("+5511987654321")).toBe(null); // Brazil
    expect(detectCurrencyFromPhone("+79001234567")).toBe(null); // Russia
    expect(detectCurrencyFromPhone("+819012345678")).toBe(null); // Japan
    expect(detectCurrencyFromPhone("+82101234567")).toBe(null); // South Korea
  });

  it("accepts numbers without the leading + (Respond.io sometimes strips it)", () => {
    expect(detectCurrencyFromPhone("4915112345678")).toBe("EUR");
    expect(detectCurrencyFromPhone("447712345678")).toBe("GBP");
  });

  it("returns null for null/undefined/empty", () => {
    expect(detectCurrencyFromPhone(null)).toBe(null);
    expect(detectCurrencyFromPhone(undefined)).toBe(null);
    expect(detectCurrencyFromPhone("")).toBe(null);
  });

  it("does not let +1 shadow +351 (longest prefix wins)", () => {
    // +351 (Portugal) starts with '+3', not '+1' — this just verifies the
    // longest-prefix-first ordering doesn't accidentally misclassify.
    expect(detectCurrencyFromPhone("+351912345678")).toBe("EUR");
    expect(detectCurrencyFromPhone("+15551234567")).toBe("USD");
  });
});
