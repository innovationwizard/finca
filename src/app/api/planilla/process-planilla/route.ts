// =============================================================================
// POST /api/planilla/process-planilla
// Processes an uploaded weekly schedule (planilla semanal) image:
//   1. Downloads image from Supabase Storage
//   2. Runs Claude Vision extraction (extract-planilla.ts)
//   3. Matches worker names to DB records
//   4. Resolves activity abbreviations (abbr.txt) → Activity.id
//   5. Resolves lote names → Lote.id (case-insensitive)
//   6. Checks for existing (date, workerId) pairs to skip duplicates
//   7. Returns enriched rows ready for the review UI
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, WRITE_ROLES } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { extractPlanillaData, type PlanillaExtractionResult } from "@/lib/ai/extract-planilla";
import { extractPlanillaFromXlsx } from "@/lib/xlsx/extract-planilla-xlsx";
import { buildActivityResolver, tokenArray } from "@/lib/xlsx/activity-aliases";
import { resolveActivityPrice } from "@/lib/pricing/resolve-price";
import { toPriceSchedule } from "@/lib/pricing/activity-prices";
import { NO_LOTE_SENTINEL } from "@/app/api/planilla/resolve-code/route";
import { matchAllWorkers } from "@/lib/ai/match-workers";
import { prisma } from "@/lib/prisma";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Activity abbreviation table — mirrors docs/abbr.txt
const ACTIVITY_ABBR: Record<string, string> = {
  CC: "Corte de Café",
  PP: "Pepena",
  CP: "Caporal",
  BE: "Beneficio",
  EB: "Encargado Beneficio",
  MU: "Muestreo de Suelos",
  RP: "Repaso Poda",
  CD: "Chapea y Desbejucar",
  FE: "Fertilización",
  LM: "Limpia Manual",
  DH: "Deshije",
  MS: "Manejo de Sombra",
  HB: "Herbicida",
  MIP: "Monitoreo de Plagas y Enfermedades",
  FG: "Aplicación de Fungicida",
  AN: "Análisis de Suelos y Foliar",
  FF: "Fertilización Foliar",
  EM: "Enmiendas",
  MG: "Mantenimiento General",
  MT: "Manejo de Tejido",
  LL: "Limpia lote",
  TZ: "Trazado para siembra",
  AH: "Ahoyado",
  SI: "Siembra",
  CA: "Trabajos varios Carbón",
};

// Strip trailing pass/round numbers: "FE 4" → "FE", "RP 1" → "RP"
function resolveAbbrToName(raw: string): string {
  const abbr = raw.trim().replace(/\s+\d+$/, "").toUpperCase();
  return ACTIVITY_ABBR[abbr] ?? raw.trim();
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { storagePath, contentType } = body as {
      storagePath: string;
      contentType: string;
    };

    if (!storagePath) {
      return NextResponse.json(
        { error: "storagePath es requerido" },
        { status: 400 },
      );
    }

    // 1. Download image from Supabase Storage
    const supabase = createServiceClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notebook-photos")
      .download(storagePath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: `Error al descargar imagen: ${downloadError?.message ?? "Archivo no encontrado"}` },
        { status: 500 },
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // 2. Fetch DB reference data in parallel.
    //    Fetched BEFORE extraction because the .xlsx parser uses the live
    //    vocabulary (activity / lote / worker names) to detect columns by
    //    content — so a renamed/reordered header still parses.
    const [workers, activities, lotes] = await Promise.all([
      prisma.worker.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true },
      }),
      prisma.activity.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          unit: true,
          defaultPrice: true,
          prices: { select: { effectiveFrom: true, price: true }, orderBy: { effectiveFrom: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.lote.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    // 3. Extract — branch by file type. Both branches return the SAME contract,
    //    so all downstream code is shared.
    const isSpreadsheet =
      contentType === XLSX_CONTENT_TYPE || /\.xlsx$/i.test(storagePath);

    let extraction: PlanillaExtractionResult;
    let xlsxReport: Record<string, unknown> | null = null;
    try {
      if (isSpreadsheet) {
        const result = extractPlanillaFromXlsx(buffer, {
          activityNames: activities.map((a) => a.name),
          loteNames: lotes.flatMap((l) => [l.name, l.slug]),
          workerNames: workers.map((w) => w.fullName),
        });
        extraction = result;
        xlsxReport = {
          formatReport: result.formatReport,
          anomalies: result.anomalies,
          counts: result.counts,
        };
      } else {
        const mediaType = (contentType || "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/webp";
        extraction = await extractPlanillaData(buffer.toString("base64"), mediaType);
      }
    } catch (extractError) {
      return NextResponse.json(
        {
          error: `Error al procesar el archivo: ${extractError instanceof Error ? extractError.message : "Error desconocido"}`,
          imageUrl: storagePath,
        },
        { status: 422 },
      );
    }

    // 4. Match worker names using fuzzy matching
    const extractedNames = extraction.rows.map((r) => r.workerName);
    const workerMatches = matchAllWorkers(extractedNames, workers);

    // 4b. Load LEARNED code mappings (from prior "¿existe o nuevo?" resolutions)
    //     so a code resolved once auto-resolves on every future import.
    const dictRows = await prisma.notebookDictionary.findMany({
      where: { category: { in: ["activity", "lote"] } },
      select: { category: true, handwritten: true, canonical: true, referenceId: true },
    });
    const actById = new Map(activities.map((a) => [a.id, a]));
    const loteById = new Map(lotes.map((l) => [l.id, l]));
    const learnedActivity = new Map<string, (typeof activities)[number]>();
    const learnedLote = new Map<string, (typeof lotes)[number]>();
    const learnedLoteNone = new Set<string>(); // codes intentionally meaning "no lote"
    for (const d of dictRows) {
      const key = normalize(d.handwritten);
      if (d.category === "activity") {
        const a =
          (d.referenceId && actById.get(d.referenceId)) ||
          activities.find((x) => normalize(x.name) === normalize(d.canonical));
        if (a) learnedActivity.set(key, a);
      } else if (d.canonical === NO_LOTE_SENTINEL) {
        learnedLoteNone.add(key);
      } else {
        const l =
          (d.referenceId && loteById.get(d.referenceId)) ||
          lotes.find((x) => normalize(x.name) === normalize(d.canonical));
        if (l) learnedLote.set(key, l);
      }
    }

    // 5. Activity resolver — exact name, then stop-word-stripped token set, then
    //    explicit aliases. Resolves the .xlsx full-name variants
    //    ("encargado de beneficio" → "Encargado Beneficio") and the photo path's
    //    abbreviation-expanded names alike.
    const resolveActivity = buildActivityResolver(activities);

    // Effective-dated price schedule per activity, for work-date pricing.
    const scheduleByActivityId = new Map(
      activities.map((a) => [a.id, toPriceSchedule(a.prices)]),
    );

    // 6. Build lote resolution map: try name, slug, and slug-without-hyphens
    const loteByKey = new Map<string, typeof lotes[number]>();
    const loteTokenized = lotes.map((l) => ({ l, toks: new Set(tokenArray(l.name)) }));
    for (const l of lotes) {
      loteByKey.set(normalize(l.name), l);
      loteByKey.set(normalize(l.slug), l);
      loteByKey.set(normalize(l.slug).replace(/-/g, ""), l);
      // Also map common shorthand variants (e.g. "cruz2" → Cruz 2)
      loteByKey.set(normalize(l.name).replace(/\s/g, ""), l);
    }

    // Token-subset fallback, only when it points to a single active lote:
    // "CANOA" → CANOA 1 (only one active canoa), "SAN EMILIANO" → SAN EMILIANO CRUZ.
    function resolveLoteBySubset(raw: string): typeof lotes[number] | null {
      const rawSet = new Set(tokenArray(raw));
      if (rawSet.size === 0) return null;
      const hits = new Set<typeof lotes[number]>();
      for (const { l, toks } of loteTokenized) {
        const subset =
          [...rawSet].every((t) => toks.has(t)) || [...toks].every((t) => rawSet.has(t));
        if (subset && toks.size > 0) hits.add(l);
      }
      return hits.size === 1 ? [...hits][0] : null;
    }

    // 7. Enrich each entry with resolved IDs
    const unresolvedActivities = new Set<string>();
    const unresolvedLotes = new Set<string>();

    const enrichedRows = extraction.rows.map((row) => ({
      workerName: row.workerName,
      entries: row.entries.map((entry) => {
        // Resolve activity: LEARNED mapping first, then abbreviation expansion +
        // tolerant matcher. Unresolved → surfaced for the resolution tree.
        const canonicalName = resolveAbbrToName(entry.activity);
        const resolvedActivity =
          learnedActivity.get(normalize(entry.activity)) ??
          resolveActivity(canonicalName) ??
          resolveActivity(entry.activity);
        if (!resolvedActivity) unresolvedActivities.add(entry.activity);

        // Resolve lote: LEARNED mapping first, then exact/variant, then subset.
        // A code learned as "no lote" resolves to null without being re-surfaced.
        const normLote = normalize(entry.lote ?? "");
        const loteIsNone = entry.lote ? learnedLoteNone.has(normLote) : false;
        const resolvedLote = loteIsNone
          ? null
          : (entry.lote ? learnedLote.get(normLote) : null) ||
            loteByKey.get(normLote) ||
            loteByKey.get(normLote.replace(/\s/g, "")) ||
            (entry.lote ? resolveLoteBySubset(entry.lote) : null);
        if (entry.lote && !loteIsNone && !resolvedLote) unresolvedLotes.add(entry.lote);

        return {
          date: entry.date,
          lote: entry.lote,
          activity: entry.activity,
          units: entry.units,
          resolvedActivityId: resolvedActivity?.id ?? null,
          resolvedActivityName: canonicalName,
          // Price in effect on the entry's work date (not a blanket default).
          resolvedActivityPrice: resolvedActivity
            ? resolveActivityPrice(
                scheduleByActivityId.get(resolvedActivity.id),
                Number(resolvedActivity.defaultPrice ?? 0),
                entry.date,
              )
            : 0,
          resolvedLoteId: resolvedLote?.id ?? null,
        };
      }),
    }));

    // 8. Determine which rows already exist — keyed on (date, worker, ACTIVITY,
    //    lote), NOT just (date, worker). A worker legitimately does several
    //    distinct activities on the same day; the coarse key was silently
    //    dropping those as "already imported". Key format is shared with the
    //    client (see buildReviewRows): `date|workerId|activityId|loteId`.
    const uniqueDates = [
      ...new Set(extraction.rows.flatMap((r) => r.entries.map((e) => e.date))),
    ];
    const existingRecords = await prisma.activityRecord.findMany({
      where: { date: { in: uniqueDates.map((d) => new Date(d)) } },
      select: { date: true, workerId: true, activityId: true, loteId: true },
    });
    const existingKeys = existingRecords.map(
      (r) => `${r.date.toISOString().split("T")[0]}|${r.workerId}|${r.activityId}|${r.loteId ?? ""}`,
    );

    // 9. Fetch open pay periods for the agricultural year
    const agYear = getCurrentAgriculturalYear();
    const payPeriods = await prisma.payPeriod.findMany({
      where: { agriculturalYear: agYear, isClosed: false },
      orderBy: { periodNumber: "desc" },
    });

    // 10. Build CSV audit trail
    const csvLines = [
      "worker_name,date,lote,activity,units,resolved_activity,resolved_lote_id,matched_worker_id,confidence",
    ];
    for (const row of enrichedRows) {
      const match = workerMatches[row.workerName];
      for (const entry of row.entries) {
        csvLines.push(
          `"${row.workerName}","${entry.date}","${entry.lote}","${entry.activity}",${entry.units},"${entry.resolvedActivityName}","${entry.resolvedLoteId ?? ""}","${match?.exactMatch?.id ?? ""}","${match?.exactMatch ? "exact" : match?.candidates.length ? "partial" : "none"}"`,
        );
      }
    }
    const csvPath = storagePath.replace(/\.\w+$/, "-planilla.csv");
    await supabase.storage.from("notebook-photos").upload(csvPath, csvLines.join("\n"), {
      contentType: "text/csv",
      upsert: true,
    });

    // 10b. For .xlsx, persist the full parser report (format detection +
    //      anomalies + balanced counts) as a JSON sidecar for audit/provenance.
    if (xlsxReport) {
      const reportPath = storagePath.replace(/\.\w+$/, "-xlsx-report.json");
      await supabase.storage
        .from("notebook-photos")
        .upload(reportPath, JSON.stringify(xlsxReport, null, 2), {
          contentType: "application/json",
          upsert: true,
        });
    }

    return NextResponse.json({
      ...(xlsxReport ?? {}),
      rows: enrichedRows,
      workerMatches: Object.fromEntries(
        Object.entries(workerMatches).map(([name, result]) => [
          name,
          {
            exactMatch: result.exactMatch
              ? { id: result.exactMatch.id, fullName: result.exactMatch.fullName }
              : null,
            candidates: result.candidates.slice(0, 3).map((c) => ({
              id: c.worker.id,
              fullName: c.worker.fullName,
              score: Math.round(c.score * 100),
            })),
          },
        ]),
      ),
      activities: activities.map((a) => ({
        id: a.id,
        name: a.name,
        unit: a.unit,
        defaultPrice: a.defaultPrice ? Number(a.defaultPrice) : null,
        priceSchedule: scheduleByActivityId.get(a.id) ?? [],
      })),
      lotes: lotes.map((l) => ({ id: l.id, name: l.name })),
      payPeriods: payPeriods.map((p) => ({
        id: p.id,
        periodNumber: p.periodNumber,
        startDate: p.startDate.toISOString().split("T")[0],
        endDate: p.endDate.toISOString().split("T")[0],
      })),
      existingKeys,
      unresolvedActivities: [...unresolvedActivities],
      unresolvedLotes: [...unresolvedLotes],
      dateRange: extraction.dateRange,
      confidence: extraction.confidence,
      notes: extraction.notes,
      imageUrl: storagePath,
      csvUrl: csvPath,
    });
  } catch (error) {
    console.error("Process-planilla error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
