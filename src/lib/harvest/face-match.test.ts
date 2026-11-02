import { describe, expect, it } from "vitest";
import { acceptStreak, humanSimilarity, nearestWorker } from "./face-match";
import { FACE_DESCRIPTOR_LENGTH } from "./constants";

function vector(fill: number, at = 0, value = fill): number[] {
  const v = Array.from({ length: FACE_DESCRIPTOR_LENGTH }, () => fill);
  v[at] = value;
  return v;
}

describe("face match", () => {
  it("scores an identical descriptor as similarity 1", () => {
    const a = vector(0.01);
    expect(humanSimilarity(a, a.slice())).toBe(1);
  });

  it("picks the worker at or above the cutoff", () => {
    const probe = vector(0.02);
    const close = probe.slice();
    close[0] = probe[0] + 0.0001;
    const far = vector(2);
    const match = nearestWorker(
      probe,
      [
        { workerId: "far", descriptor: far },
        { workerId: "close", descriptor: close },
      ],
      0.5,
    );
    expect(match?.workerId).toBe("close");
  });

  it("accepts a streak of the same worker and rejects a break", () => {
    expect(acceptStreak(["a", "a", "a"], 3)).toBe("a");
    expect(acceptStreak(["a", "b", "a"], 3)).toBeNull();
    expect(acceptStreak(["a", null, "a"], 3)).toBeNull();
    expect(acceptStreak(["a", "a"], 3)).toBeNull();
  });
});
