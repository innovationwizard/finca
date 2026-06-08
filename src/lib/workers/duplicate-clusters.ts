// =============================================================================
// src/lib/workers/duplicate-clusters.ts — High-precision duplicate-worker
// clustering. Groups records that are near-certainly the SAME person, avoiding
// common-surname mega-blobs. Pure; used by the in-app review page and the
// offline artifact generator alike.
// =============================================================================

export type WorkerLite = {
  id: string;
  fullName: string;
  recs: number; // activity record count
  pays: number; // payroll entry count
  active: boolean;
};

const SIMT = 0.85;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function tokenize(s: string): string[] {
  return norm(s).split(" ").filter(Boolean);
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function sim(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}
const tokIn = (t: string, arr: string[]) => arr.some((u) => sim(t, u) >= SIMT);

/**
 * Two records are the same person when:
 *  (a) subset — every token of the shorter name (>=2 tokens) fuzzy-appears in the
 *      longer, the first names align, and the short's surname sits in the long's
 *      PRIMARY-surname region (long[1] or long[2]); OR
 *  (b) prefix3 — the first three given names agree (a garbled last surname).
 */
export function sameWorker(aName: string, bName: string): boolean {
  const A = tokenize(aName), B = tokenize(bName);
  if (A.length === 0 || B.length === 0) return false;
  const short = A.length <= B.length ? A : B;
  const long = A.length <= B.length ? B : A;
  const subset =
    short.length >= 2 &&
    short.every((t) => tokIn(t, long)) &&
    sim(short[0], long[0]) >= SIMT &&
    (sim(short[1], long[1]) >= SIMT || sim(short[1], long[2] ?? "") >= SIMT);
  const prefix3 =
    A.length >= 3 && B.length >= 3 &&
    sim(A[0], B[0]) >= SIMT && sim(A[1], B[1]) >= SIMT && sim(A[2], B[2]) >= SIMT;
  return subset || prefix3;
}

export type DedupResult = {
  clusters: WorkerLite[][]; // each cluster sorted by record count desc
  singles: WorkerLite[];
};

/** Cluster the workers into suspected-duplicate groups (size >= 2) + singles. */
export function clusterDuplicates(workers: WorkerLite[]): DedupResult {
  const n = workers.length;
  const parent = workers.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (sameWorker(workers[i].fullName, workers[j].fullName)) union(i, j);

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r) ?? groups.set(r, []).get(r)!;
    g.push(i);
  }
  const clusters = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.map((i) => workers[i]).sort((a, b) => b.recs - a.recs))
    .sort((a, b) => b.length - a.length);
  const singles = [...groups.values()].filter((g) => g.length === 1).map((g) => workers[g[0]]);
  return { clusters, singles };
}
