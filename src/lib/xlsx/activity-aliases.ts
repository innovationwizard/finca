// =============================================================================
// src/lib/xlsx/activity-aliases.ts — Tolerant activity-name resolution.
//
// The .xlsx planilla writes FULL activity names (not the abbreviations the photo
// path uses), and humans spell them inconsistently:
//   "encargado de beneficio" / "Encargado de beneficio" → DB "Encargado Beneficio"
//   "mantenimiento general"  / "Mantenimiento General"  → DB "Mantenimiento General"
//
// A plain normalize() match fails on the first pair (they differ by the stop-word
// "de"). Instead of a brittle hand-maintained alias list, we resolve by a
// stop-word-stripped, order-independent TOKEN SET — which converges all observed
// variants onto the DB name without enumerating them. A tiny explicit alias map
// is kept only for cases token-sets cannot reach.
// =============================================================================

export type ActivityRef = { id: string; name: string; defaultPrice?: unknown; unit?: unknown };

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "a", "por", "para"]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Order-independent, stop-word-stripped token signature. */
export function tokenSetKey(s: string): string {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .sort()
    .join(" ");
}

// Explicit fallbacks for variants that token-sets alone cannot resolve.
// Keys are normalizeText() of the raw value; values are exact DB activity names.
const EXPLICIT_ALIASES: Record<string, string> = {
  "encargado de beneficio": "Encargado Beneficio",
  "encargado beneficio": "Encargado Beneficio",
  "mantenimiento gral": "Mantenimiento General",
};

export type ActivityResolver = (raw: string) => ActivityRef | null;

/**
 * Build a resolver over the live DB activity catalog.
 * Resolution order (each step unambiguous before it counts):
 *   1. exact normalized name
 *   2. token-set equality (handles "encargado de beneficio" → "Encargado Beneficio")
 *   3. explicit alias map
 * Returns null when no confident match exists (caller surfaces it as unresolved —
 * the row is NEVER dropped, only flagged for manual mapping in the review UI).
 */
export function buildActivityResolver(activities: ActivityRef[]): ActivityResolver {
  const byNorm = new Map<string, ActivityRef>();
  const byTokenSet = new Map<string, ActivityRef | null>(); // null = ambiguous

  for (const a of activities) {
    byNorm.set(normalizeText(a.name), a);
    const key = tokenSetKey(a.name);
    byTokenSet.set(key, byTokenSet.has(key) ? null : a);
  }

  return (raw: string): ActivityRef | null => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return null;

    const norm = normalizeText(trimmed);
    const exact = byNorm.get(norm);
    if (exact) return exact;

    const tokenMatch = byTokenSet.get(tokenSetKey(trimmed));
    if (tokenMatch) return tokenMatch; // skips null (ambiguous) and undefined (miss)

    const aliasName = EXPLICIT_ALIASES[norm];
    if (aliasName) {
      const aliased = byNorm.get(normalizeText(aliasName));
      if (aliased) return aliased;
    }

    return null;
  };
}
