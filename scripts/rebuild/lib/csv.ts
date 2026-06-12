// =============================================================================
// scripts/rebuild/lib/csv.ts — Minimal RFC-4180 CSV parser (text → objects).
// Handles quoted fields, commas/newlines inside quotes, and "" escapes. Returns
// every value as a VERBATIM string (no number/date interpretation) so SSOT
// values — ISO dates, legacy CUIs, accented names — are preserved exactly.
// Strips a leading UTF-8 BOM. Empty fields → "".
// =============================================================================

export function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (c === "\r") {
      // ignore; handled by the following \n (or stray CR)
    } else {
      field += c;
    }
  }
  // last field/row (if file doesn't end with newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== "")) // skip blank lines
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
      return obj;
    });
}
