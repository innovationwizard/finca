// CUI storage rule from the Priority 1 spec:
// modern 13-digit values are stored with spaces and dashes removed;
// anything else stays verbatim (legacy ids). cuiAsPrinted keeps the typed text.

export type StoredCui = {
  cui: string;
  cuiAsPrinted: string;
};

export function splitCui(raw: string): StoredCui {
  const cuiAsPrinted = raw.trim();
  const stripped = cuiAsPrinted.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(stripped)) {
    return { cui: stripped, cuiAsPrinted };
  }
  return { cui: cuiAsPrinted, cuiAsPrinted };
}

/** Exact match key. Empty input never matches. */
export function cuiMatchKey(raw: string): string {
  return splitCui(raw).cui;
}
