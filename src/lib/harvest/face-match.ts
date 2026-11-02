import { FACE_DESCRIPTOR_LENGTH, FACE_MATCH_CONSECUTIVE_FRAMES } from "./constants";

/**
 * Human 3.3 `match.distance` with its defaults (order 2, multiplier 25).
 * This is 25 × the sum of squared differences, not raw Euclidean distance.
 */
export function humanDistance(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.round(100 * 25 * sum) / 100;
}

/**
 * Human 3.3 `match.similarity` with its defaults (min 0.2, max 0.8).
 * 1 is the same vector. 0 is far. The library treats above 0.5 as a match.
 */
export function humanSimilarity(a: number[], b: number[]): number | null {
  const dist = humanDistance(a, b);
  if (dist == null) return null;
  if (dist === 0) return 1;
  const root = Math.sqrt(dist);
  const min = 0.2;
  const max = 0.8;
  const norm = (1 - root / 100 - min) / (max - min);
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}

export type DescriptorRef = {
  workerId: string;
  descriptor: number[];
};

export function isFaceDescriptor(value: number[]): boolean {
  return value.length === FACE_DESCRIPTOR_LENGTH && value.every((n) => Number.isFinite(n));
}

/** Best worker at or above the similarity cutoff. Null when nobody qualifies. */
export function nearestWorker(
  probe: number[],
  refs: DescriptorRef[],
  minSimilarity: number,
): { workerId: string; similarity: number } | null {
  if (!isFaceDescriptor(probe)) return null;
  let best: { workerId: string; similarity: number } | null = null;
  for (const ref of refs) {
    if (!isFaceDescriptor(ref.descriptor)) continue;
    const similarity = humanSimilarity(probe, ref.descriptor);
    if (similarity == null || similarity < minSimilarity) continue;
    if (!best || similarity > best.similarity) {
      best = { workerId: ref.workerId, similarity };
    }
  }
  return best;
}

/** Same worker id on the last `needed` frames. Nulls break the streak. */
export function acceptStreak(
  workerIds: (string | null)[],
  needed = FACE_MATCH_CONSECUTIVE_FRAMES,
): string | null {
  if (workerIds.length < needed) return null;
  const tail = workerIds.slice(-needed);
  const first = tail[0];
  if (!first) return null;
  return tail.every((id) => id === first) ? first : null;
}
