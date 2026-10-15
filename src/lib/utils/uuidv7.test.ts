// =============================================================================
// src/lib/utils/uuidv7.test.ts — Ids the capture grid assigns to new lines.
//
// The save route creates a record with the client's id and rejects anything
// that is not a UUIDv7, so the generator and the check must agree.
//   npx vitest run
// =============================================================================

import { describe, expect, it } from "vitest";
import { isUuidv7, uuidv7 } from "./uuidv7";

describe("uuidv7", () => {
  it("produces a well-formed v7 (version 7, variant 10xx)", () => {
    for (let i = 0; i < 200; i++) {
      const id = uuidv7();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(isUuidv7(id)).toBe(true);
    }
  });

  it("embeds the current time in the first 48 bits", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ms = parseInt(id.replace(/-/g, "").slice(0, 12), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});

describe("isUuidv7", () => {
  it("rejects other versions and malformed strings", () => {
    expect(isUuidv7("3b241101-e2bb-4255-8caf-4136c566a962")).toBe(false); // v4
    expect(isUuidv7("0192f5e8-3b1a-7c4d-cb12-0123456789ab")).toBe(false); // wrong variant
    expect(isUuidv7("not-a-uuid")).toBe(false);
    expect(isUuidv7("")).toBe(false);
  });
});
