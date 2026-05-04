# Plan: AI Date Extraction from Notebook Photos

## Problem

`upload-foto.tsx` constructs dates from form state (`month`, `year`) that defaults to the current calendar month/year.
When a user uploads an April notebook photo in May, every record gets wrong dates (May instead of April).

The AI already reads worker names from the image. It must also read the month and year.

## Notebook Structure (observed from 3 real photos)

- Top-left corner: month and year written in large text. Examples: "ABRIL 2026", "ABriL 3026" (handwriting variation — 3026 should be interpreted as 2026).
- Header rows: one or two rows of day numbers.
  - Some pages: single row with day numbers only (e.g. "9 10 11 12 13 14 15 16 17 18 19 20").
  - Other pages: two rows — row 1 weekday initials (M M J V S D L …), row 2 day numbers (21 22 23 24 25 26 27 28 29 30).
- Days extracted per cell are already returned as `entry.day` numbers — this part works.

## Fix: 3 Files

### 1. `src/lib/ai/extract-notebook.ts`

**Type change** — add `month` and `year` to `ExtractionResult`:

```ts
export type ExtractionResult = {
  rows: ExtractedRow[];
  month: number;   // 1-12, extracted from image
  year: number;    // 4-digit, extracted from image
  confidence: "high" | "medium" | "low";
  notes: string;
};
```

**System prompt addition** — insert before the JSON schema block:

```
FECHA DEL CUADERNO:
- En la esquina superior izquierda hay un mes y año escritos a mano (ej: "ABRIL 2026", "MARZO 2025")
- Lee el mes y conviértelo a número (ENERO=1, FEBRERO=2, ..., DICIEMBRE=12)
- Lee el año tal como está. Si parece un error tipográfico (ej: 3026), corrígelo al año más cercano razonable (2026)
- Incluye "month" y "year" en la respuesta JSON
```

**JSON schema example** — add the two new fields:

```json
{
  "month": 4,
  "year": 2026,
  "rows": [...],
  "confidence": "high",
  "notes": "..."
}
```

**Validation** — after `JSON.parse`, before post-processing:
- If `parsed.month` is not 1-12, fall back to `context.month` (the form value passed in).
- If `parsed.year` is not a 4-digit integer between 2020-2040, fall back to `context.year`.
- This ensures the change is non-breaking even if AI omits the fields.

### 2. `src/app/api/planilla/process-foto/route.ts`

No changes needed. The `extraction` object is passed through to the client as-is:
```ts
return NextResponse.json({ extraction, workerMatches, activities, ... });
```
`month` and `year` will flow automatically once the AI returns them.

### 3. `src/app/(authenticated)/planilla/nueva/upload-foto.tsx`

**Type update** — add to `ExtractionResponse.extraction`:
```ts
extraction: {
  rows: ...;
  month?: number;
  year?: number;
  confidence: string;
  notes: string;
};
```

**After AI response**, extract effective month/year before building `reviewRows`:
```ts
const effectiveMonth = (result.extraction.month >= 1 && result.extraction.month <= 12)
  ? result.extraction.month
  : month;
const effectiveYear = (result.extraction.year >= 2020 && result.extraction.year <= 2040)
  ? result.extraction.year
  : year;

// Update form state so the user can see what was detected (and correct if wrong)
setMonth(effectiveMonth);
setYear(effectiveYear);
```

**Date construction** — replace `year` and `month` references with `effectiveYear`/`effectiveMonth`:
```ts
// Line 155 currently:
const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(entry.day).padStart(2, "0")}`;
// Replace with:
const dateStr = `${effectiveYear}-${String(effectiveMonth).padStart(2, "0")}-${String(entry.day).padStart(2, "0")}`;
```

React state updates (`setMonth`, `setYear`) are async — they won't affect the closure. Using local `effectiveMonth`/`effectiveYear` variables is correct.

## What does NOT change

- The month/year form fields remain editable — the user can still correct the AI-detected values.
- The AI still receives `context.month` and `context.year` as fallback hints in the user message.
- `clientId` in batch/route.ts is unaffected (it uses `r.date` from the row, which will now be correct).
- No schema migration needed.

## Rollout

1. Update `extract-notebook.ts` (prompt + types + validation).
2. Update `upload-foto.tsx` (type + effectiveMonth/Year + date construction).
3. Deploy. Re-upload the April photo with any month selected — the extracted month/year should override.
4. Verify review table shows April dates.
