// =============================================================================
// src/lib/ai/match-workers.ts — Fuzzy worker name matching
// Maps handwritten names from notebook photos to Worker DB records.
// =============================================================================

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
    .replace(/[\u0300-\u036f]/g, "") // strip accents
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

export function matchWorkerName(
  extractedName: string,
  workers: WorkerRecord[],
): MatchResult {
  const normExtracted = normalize(extractedName);
  const tokensExtracted = tokenize(extractedName);

  // 1. Exact match on normalized name
  const exact = workers.find((w) => normalize(w.fullName) === normExtracted);
  if (exact) {
    return { exactMatch: exact, candidates: [] };
  }

  // 2. Token-based partial match
  const tokenMatches: { worker: WorkerRecord; score: number }[] = [];
  for (const w of workers) {
    const tokensWorker = tokenize(w.fullName);
    let matchCount = 0;
    for (const te of tokensExtracted) {
      for (const tw of tokensWorker) {
        if (tw === te || tw.startsWith(te) || te.startsWith(tw)) {
          matchCount++;
          break;
        }
      }
    }
    if (matchCount >= Math.min(2, tokensExtracted.length)) {
      const score = matchCount / Math.max(tokensExtracted.length, tokensWorker.length);
      tokenMatches.push({ worker: w, score });
    }
  }

  if (tokenMatches.length > 0) {
    tokenMatches.sort((a, b) => b.score - a.score);
    if (tokenMatches[0].score >= 0.6) {
      return { exactMatch: tokenMatches[0].worker, candidates: tokenMatches };
    }
    return { exactMatch: null, candidates: tokenMatches };
  }

  // 3. Levenshtein distance fallback
  const levMatches: { worker: WorkerRecord; score: number }[] = [];
  for (const w of workers) {
    const normWorker = normalize(w.fullName);
    const dist = levenshtein(normExtracted, normWorker);
    const maxLen = Math.max(normExtracted.length, normWorker.length);
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.5) {
      levMatches.push({ worker: w, score: similarity });
    }
  }
  levMatches.sort((a, b) => b.score - a.score);

  return { exactMatch: null, candidates: levMatches.slice(0, 5) };
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
