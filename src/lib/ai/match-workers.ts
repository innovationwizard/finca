// =============================================================================
// src/lib/ai/match-workers.ts — Fuzzy worker name matching
// Maps handwritten names from notebook photos to Worker DB records.
//
// Algorithm: per-token Levenshtein.
//   For each extracted token, find the closest token in the worker's full name.
//   A worker is scored as the average of its best per-token similarities.
//   Auto-select when score ≥ AUTO_MATCH_MIN AND the top match beats the
//   runner-up by ≥ UNIQUE_MARGIN (prevents false positives when multiple
//   workers share the same first name).
//
// Thresholds (tuned against real notebook names):
//   TOKEN_FUZZY_MIN  0.65 — "noami" ↔ "nohemi" = 0.67 ✓
//                           "wuilfido" ↔ "wilfrido" = 0.75 ✓
//   AUTO_MATCH_MIN   0.70 — must pass before auto-selecting
//   UNIQUE_MARGIN    0.15 — gap required between 1st and 2nd candidate
// =============================================================================

const TOKEN_FUZZY_MIN = 0.65;
const AUTO_MATCH_MIN = 0.70;
const UNIQUE_MARGIN = 0.15;

type WorkerRecord = {
  id: string;
  fullName: string;
};

type MatchResult = {
  exactMatch: WorkerRecord | null;
  candidates: { worker: WorkerRecord; score: number }[];
};

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  return normalize(name).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

function tokenSimilarity(te: string, tw: string): number {
  if (tw === te) return 1.0;
  if (tw.startsWith(te) || te.startsWith(tw)) return 1.0;
  const dist = levenshtein(te, tw);
  return 1 - dist / Math.max(te.length, tw.length);
}

export function matchWorkerName(
  extractedName: string,
  workers: WorkerRecord[],
): MatchResult {
  const normExtracted = normalize(extractedName);
  const tokensExtracted = tokenize(extractedName);

  // 1. Exact match on normalized full name
  const exact = workers.find((w) => normalize(w.fullName) === normExtracted);
  if (exact) {
    return { exactMatch: exact, candidates: [] };
  }

  // 2. Per-token fuzzy scoring — tolerant of EXTRA tokens on either side.
  //
  // Names rarely line up token-for-token: the source may carry an extra surname
  // the DB record lacks ("Gidalberto Solano Arenas" vs "Gildaberto Solano"), or
  // the DB record may be longer than a short handwritten name ("Henry Hernandez"
  // vs "Henry Randolfo Hernandez Solano"). A worker is a candidate when ONE name
  // is a fuzzy token-subset of the other (every token of the shorter side has a
  // strong match in the longer side). Requiring ≥2 shared tokens (or all, for a
  // one-token name) keeps a lone shared surname from matching everyone. The
  // AUTO_MATCH_MIN + UNIQUE_MARGIN gating below still guards against ambiguity.
  const scored: { worker: WorkerRecord; score: number }[] = [];
  if (tokensExtracted.length === 0) return { exactMatch: null, candidates: [] };

  for (const w of workers) {
    const tokensWorker = tokenize(w.fullName);
    if (tokensWorker.length === 0) continue;

    const fwd = tokensExtracted.map((te) =>
      Math.max(0, ...tokensWorker.map((tw) => tokenSimilarity(te, tw))),
    );
    const bwd = tokensWorker.map((tw) =>
      Math.max(0, ...tokensExtracted.map((te) => tokenSimilarity(te, tw))),
    );

    const matchedFwd = fwd.filter((s) => s >= TOKEN_FUZZY_MIN).length;
    const matchedBwd = bwd.filter((s) => s >= TOKEN_FUZZY_MIN).length;
    const extractedCovered = matchedFwd === tokensExtracted.length;
    const dbCovered = matchedBwd === tokensWorker.length;
    if (!extractedCovered && !dbCovered) continue;

    const shared = Math.min(matchedFwd, matchedBwd);
    if (shared < Math.min(2, tokensExtracted.length, tokensWorker.length)) continue;

    // Score over the fully-covered (shorter) side's matched similarities, so an
    // extra unmatched surname neither blocks nor dilutes the match.
    const sims = dbCovered ? bwd : fwd;
    const matched = sims.filter((s) => s >= TOKEN_FUZZY_MIN);
    scored.push({ worker: w, score: matched.reduce((a, b) => a + b, 0) / matched.length });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { exactMatch: null, candidates: [] };
  }

  const best = scored[0];
  const runnerUp = scored[1];
  const isUnambiguous = !runnerUp || best.score - runnerUp.score >= UNIQUE_MARGIN;

  if (best.score >= AUTO_MATCH_MIN && isUnambiguous) {
    return { exactMatch: best.worker, candidates: scored };
  }

  return { exactMatch: null, candidates: scored };
}

export function matchAllWorkers(
  extractedNames: string[],
  workers: WorkerRecord[],
): Record<string, MatchResult> {
  const results: Record<string, MatchResult> = {};
  for (const name of extractedNames) {
    results[name] = matchWorkerName(name, workers);
  }
  return results;
}
