// =============================================================================
// src/lib/ai/extract-planilla.ts — Claude Vision extraction for the printed
// weekly schedule format (planilla semanal).
//
// Format: digital/printed spreadsheet with this column layout:
//   Header row:  FECHA | [date per day, e.g. "lunes, 13 de abril de 2026" × 6]
//   Sub-header:  Trabajador | Lote | Actividad | Unidades  (×6 days)
//   Data rows:   worker name | (lote, activity abbr, units) per day
//
// The AI reads exact dates from column headers (no month/year input needed)
// and returns raw lote names and activity abbreviations verbatim.
// Abbreviation → Activity resolution and lote → Lote.id resolution happen
// in the API route, not here.
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";

export type PlanillaEntry = {
  date: string;     // "YYYY-MM-DD", parsed from printed column header
  lote: string;     // raw Lote cell value, e.g. "CANOA", "CRUZ 2", "CASA"
  activity: string; // raw Actividad abbreviation, e.g. "MS", "CC", "FE 4"
  units: number;    // blank or "TAREA" → 1; numeric value → that number
};

export type PlanillaRow = {
  workerName: string;
  entries: PlanillaEntry[];
};

export type PlanillaExtractionResult = {
  rows: PlanillaRow[];
  dateRange: { start: string; end: string };
  confidence: "high" | "medium" | "low";
  notes: string;
};

const SYSTEM_PROMPT = `Eres un experto leyendo planillas semanales IMPRESAS de fincas cafetaleras en Guatemala.

ESTRUCTURA DE LA PLANILLA:
- Fila de encabezado: "FECHA" seguido de hasta 7 columnas de fechas, cada una con un día y fecha completa (ej: "lunes, 13 de abril de 2026")
- Sub-encabezado bajo cada fecha: 3 columnas: Lote | Actividad | Unidades
- Filas de datos: nombre del trabajador seguido de los valores Lote, Actividad, Unidades por cada día

EXTRACCIÓN DE FECHAS DEL ENCABEZADO:
- Convierte cada fecha a formato ISO "YYYY-MM-DD"
  Ejemplo: "lunes, 13 de abril de 2026" → "2026-04-13"
- Meses: enero=01, febrero=02, marzo=03, abril=04, mayo=05, junio=06,
         julio=07, agosto=08, septiembre=09, octubre=10, noviembre=11, diciembre=12

REGLAS POR CELDA DE DATOS:
- Lote: copia el texto exactamente (ej: "CANOA", "CRUZ 2", "CASA", "MIRASOL", "SAN EMILIA")
- Actividad: copia la abreviatura exactamente (ej: "MS", "CC", "RP", "MG", "LL", "FE 4", "RP 1")
- Unidades: convierte a número — vacío o "TAREA" → 1; número → ese número
- Si Lote y Actividad contienen el mismo valor (ej: "CP" y "CP"), es un Caporal:
  usa lote="" (cadena vacía) y actividad="CP"
- Omite la entrada si tanto Lote como Actividad están vacíos

Devuelve SIEMPRE un JSON válido con esta estructura exacta (sin texto adicional):
{
  "dateRange": { "start": "2026-04-13", "end": "2026-04-18" },
  "rows": [
    {
      "workerName": "Marco Antonio Solano",
      "entries": [
        { "date": "2026-04-13", "lote": "CANOA", "activity": "LL", "units": 1 },
        { "date": "2026-04-14", "lote": "CANOA", "activity": "LL", "units": 1 },
        { "date": "2026-04-16", "lote": "CRUZ 2", "activity": "MS", "units": 1 }
      ]
    }
  ],
  "confidence": "high",
  "notes": "Observaciones sobre legibilidad o dudas"
}`;

export async function extractPlanillaData(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<PlanillaExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          { type: "text", text: "Extrae todos los datos de esta planilla semanal." },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No se recibió respuesta de texto del modelo");
  }

  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let parsed: PlanillaExtractionResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Respuesta del modelo no es JSON válido: ${jsonStr.substring(0, 200)}`);
  }

  if (!Array.isArray(parsed.rows)) {
    throw new Error("La respuesta no contiene un array 'rows'");
  }

  // Normalize and filter
  for (const row of parsed.rows) {
    row.workerName = (row.workerName || "").trim();
    row.entries = (row.entries || []).filter(
      (e) =>
        e.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
        e.activity &&
        typeof e.units === "number" &&
        e.units >= 0,
    );
  }
  parsed.rows = parsed.rows.filter((r) => r.workerName && r.entries.length > 0);

  // Ensure dateRange is populated even if AI omitted it
  if (!parsed.dateRange?.start) {
    const allDates = parsed.rows.flatMap((r) => r.entries.map((e) => e.date)).sort();
    parsed.dateRange = {
      start: allDates[0] ?? "",
      end: allDates[allDates.length - 1] ?? "",
    };
  }

  return parsed;
}
