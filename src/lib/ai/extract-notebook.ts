// =============================================================================
// src/lib/ai/extract-notebook.ts — Claude Vision notebook extraction
// Sends a photo of a handwritten notebook page to Claude and returns
// structured data (worker × day × quantity).
// Uses the persistent dictionary for name corrections and abbreviations.
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  loadDictionary,
  applyDictionary,
  resolveAbbreviation,
  dictionaryToPromptContext,
} from "./notebook-dictionary";

export type ExtractedEntry = {
  day: number;
  quantity: number;
  unit: "qq" | "lb" | "day" | "mz";
  activityOverride?: string; // If cell contains an abbreviation like "B", "Poda/Cruz"
  notes?: string;
};

export type ExtractedRow = {
  workerName: string;
  correctedName?: string;
  workerId?: string | null;
  wasLearned?: boolean;
  entries: ExtractedEntry[];
};

export type ExtractionResult = {
  rows: ExtractedRow[];
  month: number;  // 1-12, extracted from image header
  year: number;   // 4-digit, extracted from image header
  confidence: "high" | "medium" | "low";
  notes: string;
};

const SYSTEM_PROMPT = `Eres un experto leyendo cuadernos de planilla de fincas cafetaleras en Guatemala.

Recibirás una foto de una página de cuaderno con una tabla/cuadrícula escrita a mano.

FECHA DEL CUADERNO:
- En la esquina superior izquierda hay un mes y año escritos a mano (ej: "ABRIL 2026", "MARZO 2025")
- Lee el mes y conviértelo a número (ENERO=1, FEBRERO=2, MARZO=3, ABRIL=4, MAYO=5, JUNIO=6, JULIO=7, AGOSTO=8, SEPTIEMBRE=9, OCTUBRE=10, NOVIEMBRE=11, DICIEMBRE=12)
- Lee el año tal como está escrito. Si parece un error tipográfico (ej: 3026), corrígelo al año más cercano razonable (2026)
- Incluye "month" y "year" en el JSON de respuesta

Estructura de la cuadrícula:
- Columna izquierda: nombres de trabajadores (escritos a mano)
- Fila(s) superior(es): días del mes (números). Puede haber una fila de iniciales de días (L M M J V S D) seguida de una fila de números, o solo una fila con los números directamente
- Valores en celdas: cantidades trabajadas ese día
- Puede haber una columna de totales a la derecha (ignórala, nosotros calculamos)

REGLAS DE EXTRACCIÓN:
- Preserva los nombres como están escritos (se corregirán después con el diccionario)
- Los NÚMEROS ENTEROS en celdas representan LIBRAS (lbs), NO quintales
  Ejemplo: "150" = 150 libras. Reporta el valor tal cual, no dividas entre 100.
- Los números con decimales (ej: "1.5", "1.35") son quintales directamente
- Celdas vacías = el trabajador no trabajó ese día (no incluir)
- "X" = Ausente (omitir esa celda completamente)
- "B" = Beneficio (incluir como activityOverride: "Beneficio")
- Si ves anotaciones como "Poda", "mg/Poda", "Poda/Cruz" junto a un nombre o celda,
  repórtalas en el campo activityOverride
- Si un número está tachado, omítelo
- Si un valor es ilegible, usa tu mejor estimación y agrega una nota

Para cada celda, determina la unidad:
- Si el valor es un entero >= 10, es "lb" (libras)
- Si el valor es decimal (ej: 1.5, 2.35), es "qq" (quintales)
- Si el valor es 1 o fracción pequeña y el contexto sugiere trabajo diario, es "day"
- En caso de duda, usa "qq"

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "month": 4,
  "year": 2026,
  "rows": [
    {
      "workerName": "Nombre del trabajador",
      "entries": [
        { "day": 1, "quantity": 150, "unit": "lb" },
        { "day": 2, "quantity": 1.5, "unit": "qq" },
        { "day": 3, "quantity": 1, "unit": "day", "activityOverride": "Beneficio" }
      ]
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "Observaciones sobre legibilidad o valores inciertos"
}`;

export async function extractNotebookData(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  context: {
    month: number;
    year: number;
    activityName?: string;
    unitPrice?: number;
  },
): Promise<ExtractionResult> {
  // Load the persistent dictionary
  const dict = await loadDictionary();
  const dictContext = dictionaryToPromptContext(dict);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const userMessage = [
    `Mes: ${context.month}, Año: ${context.year}`,
    context.activityName ? `Actividad principal: ${context.activityName}` : "",
    context.unitPrice ? `Precio unitario: Q${context.unitPrice}` : "",
    "",
    dictContext,
    "",
    "Extrae todos los datos visibles de esta página del cuaderno.",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

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
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: userMessage,
          },
        ],
      },
    ],
  });

  // Extract text content from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No se recibió respuesta de texto del modelo");
  }

  // Parse JSON from response (may be wrapped in markdown code block)
  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Respuesta del modelo no es JSON válido: ${jsonStr.substring(0, 200)}`);
  }

  // Validate structure
  if (!Array.isArray(parsed.rows)) {
    throw new Error("La respuesta no contiene un array 'rows'");
  }

  // Validate extracted month/year; fall back to context values if AI missed or mangled them
  const extractedMonth = typeof parsed.month === "number" && parsed.month >= 1 && parsed.month <= 12
    ? parsed.month
    : context.month;
  const extractedYear = typeof parsed.year === "number" && parsed.year >= 2020 && parsed.year <= 2040
    ? parsed.year
    : context.year;
  parsed.month = extractedMonth;
  parsed.year = extractedYear;

  // Post-processing: apply dictionary and normalize values
  for (const row of parsed.rows) {
    row.workerName = (row.workerName || "").trim();

    // Apply dictionary for worker name correction
    const dictMatch = applyDictionary(row.workerName, dict);
    row.correctedName = dictMatch.correctedName;
    row.workerId = dictMatch.workerId;
    row.wasLearned = dictMatch.wasLearned;

    // Process entries
    row.entries = (row.entries || [])
      .filter((e) => typeof e.day === "number" && typeof e.quantity === "number" && e.quantity > 0)
      .map((e) => {
        // Resolve activity abbreviations
        if (e.activityOverride) {
          const resolved = resolveAbbreviation(e.activityOverride, dict);
          if (resolved) {
            e.activityOverride = resolved;
          }
        }

        // Ensure unit is set
        if (!e.unit) {
          if (Number.isInteger(e.quantity) && e.quantity >= 10) {
            e.unit = "lb";
          } else {
            e.unit = "qq";
          }
        }

        // Convert libras to quintales if needed (for consistency in the review table)
        // Keep original value — the review UI will show both
        return e;
      });
  }

  // Remove rows with no valid entries
  parsed.rows = parsed.rows.filter((r) => r.workerName && r.entries.length > 0);

  return parsed;
}
