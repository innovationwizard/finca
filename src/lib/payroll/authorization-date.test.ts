import { describe, expect, it } from "vitest";
import { formatDmy, guatemalaDateISO, nextDateISO, payableEndISO } from "./authorization-date";

describe("authorization date", () => {
  it("reads 23:40 UTC on 15 Oct as the afternoon of 15 Oct in Guatemala", () => {
    expect(guatemalaDateISO(new Date("2026-10-15T23:40:34.591Z"))).toBe("2026-10-15");
  });

  it("does not roll the date forward at 18:30 Guatemala, which is already the next UTC date", () => {
    expect(guatemalaDateISO(new Date("2026-10-16T00:30:00.000Z"))).toBe("2026-10-15");
  });

  it("cuts a planned end that is still in the future back to the authorization day", () => {
    expect(payableEndISO("2026-09-10", "2026-10-17", new Date("2026-10-15T23:40:34.591Z"))).toBe("2026-10-15");
  });

  it("keeps an end that is already on or before the authorization day", () => {
    expect(payableEndISO("2026-08-12", "2026-09-09", new Date("2026-09-10T18:55:19.182Z"))).toBe("2026-09-09");
    expect(payableEndISO("2026-09-10", "2026-10-15", new Date("2026-10-15T23:40:34.591Z"))).toBe("2026-10-15");
  });

  it("refuses a period that has not started by the authorization day", () => {
    expect(payableEndISO("2026-10-18", "2026-11-14", new Date("2026-10-16T15:00:00.000Z"))).toBeNull();
  });

  it("formats the day the dialog and the errors show", () => {
    expect(nextDateISO("2026-10-15")).toBe("2026-10-16");
    expect(formatDmy("2026-10-15")).toBe("15/10/2026");
  });
});
