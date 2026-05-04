import { describe, expect, it } from "vitest";

import { readBranchField, type RespondIoIncomingMessage } from "@dpm/shared";

function contact(
  partial: Partial<RespondIoIncomingMessage["contact"]>,
): RespondIoIncomingMessage["contact"] {
  return {
    id: "1",
    tags: [],
    ...partial,
  };
}

describe("readBranchField", () => {
  it("returns the value from contact.customFields.Branch", () => {
    const c = contact({ customFields: { Branch: "Gili Trawangan" } });
    expect(readBranchField(c)).toBe("Gili Trawangan");
  });

  it("falls back to contact.fields when customFields is absent", () => {
    const c = contact({ fields: { Branch: "Koh Tao" } });
    expect(readBranchField(c)).toBe("Koh Tao");
  });

  it("falls back to contact.custom_fields (snake case) as last resort", () => {
    const c = contact({ custom_fields: { Branch: "Nusa Penida" } });
    expect(readBranchField(c)).toBe("Nusa Penida");
  });

  it("accepts the field key in mixed case (branch / BRANCH)", () => {
    expect(readBranchField(contact({ customFields: { branch: "Gili Air" } }))).toBe(
      "Gili Air",
    );
    expect(readBranchField(contact({ customFields: { BRANCH: "Koh Phi Phi" } }))).toBe(
      "Koh Phi Phi",
    );
  });

  it("trims whitespace around the value", () => {
    expect(
      readBranchField(contact({ customFields: { Branch: "  Gili Trawangan  " } })),
    ).toBe("Gili Trawangan");
  });

  it("returns null when no field bag has a Branch entry", () => {
    expect(readBranchField(contact({}))).toBe(null);
    expect(readBranchField(contact({ customFields: {} }))).toBe(null);
    expect(readBranchField(contact({ customFields: { Other: "x" } }))).toBe(null);
  });

  it("returns null for empty / whitespace-only Branch values", () => {
    expect(readBranchField(contact({ customFields: { Branch: "" } }))).toBe(null);
    expect(readBranchField(contact({ customFields: { Branch: "   " } }))).toBe(null);
  });

  it("returns null when Branch is non-string (defensive)", () => {
    expect(readBranchField(contact({ customFields: { Branch: 42 } }))).toBe(null);
    expect(readBranchField(contact({ customFields: { Branch: null } }))).toBe(null);
  });

  it("ignores tags entirely (Branch is the canonical mechanism)", () => {
    const c = contact({ tags: ["sede:gili_trawangan"] });
    expect(readBranchField(c)).toBe(null);
  });

  it("prefers customFields over fields when both have a Branch", () => {
    const c = contact({
      customFields: { Branch: "Gili Trawangan" },
      fields: { Branch: "Koh Tao" },
    });
    expect(readBranchField(c)).toBe("Gili Trawangan");
  });
});
