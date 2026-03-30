// =============================================================================
// src/lib/ai/notebook-dictionary.ts — Persistent dictionary for notebook OCR
//
// Stores learned corrections so handwriting mistakes are fixed once, forever.
// Categories:
//   "worker"       — handwritten name → canonical full name
//   "activity"     — abbreviation → activity name
//   "lote"         — abbreviation → lote name
//   "abbreviation" — special codes → meaning
// =============================================================================

import { prisma } from "@/lib/prisma";

export type DictionaryEntry = {
  id: string;
  category: string;
  handwritten: string;
  canonical: string;
  referenceId: string | null;
};

// ── Built-in mappings (always available, no DB needed) ──────────────────────

const BUILTIN_ABBREVIATIONS: Record<string, string> = {
  "B": "Beneficio",
  "X": "Ausente",
  "mg/Poda": "Mantenimiento General Poda",
  "Poda/Cruz": "Poda Cruz 2",
  "Enc. Beneficio": "Encargado Beneficio",
  "Enc Beneficio": "Encargado Beneficio",
  "E.B.": "Encargado Beneficio",
  "EB": "Encargado Beneficio",
  "Cap": "Caporal",
  "Corte": "Corte de Café",
  "R. Poda": "Repaso Poda",
  "Muestreo": "Muestreo de Suelos",
};

// ── Data type rules ─────────────────────────────────────────────────────────

export const VALUE_RULES = {
  // Integers in notebook cells represent Libras (lbs), not quintales
  integersAreLbs: true,
  // 1 quintal = 100 libras
  lbsPerQuintal: 100,
} as const;

// ── Load full dictionary from DB + builtins ─────────────────────────────────

export async function loadDictionary(): Promise<{
  workers: Map<string, { canonical: string; referenceId: string | null }>;
  activities: Map<string, { canonical: string; referenceId: string | null }>;
  lotes: Map<string, { canonical: string; referenceId: string | null }>;
  abbreviations: Map<string, string>;
}> {
  const entries = await prisma.notebookDictionary.findMany();

  const workers = new Map<string, { canonical: string; referenceId: string | null }>();
  const activities = new Map<string, { canonical: string; referenceId: string | null }>();
  const lotes = new Map<string, { canonical: string; referenceId: string | null }>();
  const abbreviations = new Map<string, string>();

  // Load builtins first
  for (const [hw, canon] of Object.entries(BUILTIN_ABBREVIATIONS)) {
    abbreviations.set(hw.toLowerCase(), canon);
  }

  // Then DB entries (override builtins if present)
  for (const e of entries) {
    const key = e.handwritten.toLowerCase();
    switch (e.category) {
      case "worker":
        workers.set(key, { canonical: e.canonical, referenceId: e.referenceId });
        break;
      case "activity":
        activities.set(key, { canonical: e.canonical, referenceId: e.referenceId });
        break;
      case "lote":
        lotes.set(key, { canonical: e.canonical, referenceId: e.referenceId });
        break;
      case "abbreviation":
        abbreviations.set(key, e.canonical);
        break;
    }
  }

  return { workers, activities, lotes, abbreviations };
}

// ── Learn a new correction (persist to DB) ──────────────────────────────────

export async function learnCorrection(
  category: string,
  handwritten: string,
  canonical: string,
  referenceId?: string,
): Promise<void> {
  await prisma.notebookDictionary.upsert({
    where: {
      category_handwritten: { category, handwritten: handwritten.toLowerCase() },
    },
    update: { canonical, referenceId: referenceId || null },
    create: {
      category,
      handwritten: handwritten.toLowerCase(),
      canonical,
      referenceId: referenceId || null,
    },
  });
}

// ── Apply dictionary to extracted data ──────────────────────────────────────

export function applyDictionary(
  workerName: string,
  dict: Awaited<ReturnType<typeof loadDictionary>>,
): { correctedName: string; workerId: string | null; wasLearned: boolean } {
  const key = workerName.toLowerCase().trim();

  const match = dict.workers.get(key);
  if (match) {
    return { correctedName: match.canonical, workerId: match.referenceId, wasLearned: true };
  }

  return { correctedName: workerName, workerId: null, wasLearned: false };
}

export function resolveAbbreviation(
  value: string,
  dict: Awaited<ReturnType<typeof loadDictionary>>,
): string | null {
  const key = value.toLowerCase().trim();
  return dict.abbreviations.get(key) || null;
}

// ── Format dictionary as prompt context for Claude ──────────────────────────

export function dictionaryToPromptContext(
  dict: Awaited<ReturnType<typeof loadDictionary>>,
): string {
  const lines: string[] = [];

  lines.push("DICCIONARIO DE NOMBRES CONOCIDOS (usar estos nombres exactos cuando se reconozcan):");
  for (const [hw, data] of dict.workers) {
    lines.push(`  "${hw}" → "${data.canonical}"`);
  }

  lines.push("\nABREVIATURAS CONOCIDAS:");
  for (const [hw, canon] of dict.abbreviations) {
    lines.push(`  "${hw}" → "${canon}"`);
  }

  if (dict.activities.size > 0) {
    lines.push("\nACTIVIDADES CONOCIDAS:");
    for (const [hw, data] of dict.activities) {
      lines.push(`  "${hw}" → "${data.canonical}"`);
    }
  }

  if (dict.lotes.size > 0) {
    lines.push("\nLOTES CONOCIDOS:");
    for (const [hw, data] of dict.lotes) {
      lines.push(`  "${hw}" → "${data.canonical}"`);
    }
  }

  lines.push("\nREGLAS DE VALORES:");
  lines.push("  - Los números enteros en celdas representan LIBRAS (lbs), no quintales");
  lines.push("  - 100 lbs = 1 quintal");
  lines.push('  - "X" o celda marcada con X = Ausente (omitir del resultado)');
  lines.push('  - "B" = Beneficio (actividad)');

  return lines.join("\n");
}
