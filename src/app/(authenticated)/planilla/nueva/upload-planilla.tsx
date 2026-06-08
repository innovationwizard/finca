"use client";

// =============================================================================
// Upload a printed weekly schedule (planilla semanal), extract via AI,
// review, and save to DB.
//
// Parallel to upload-foto.tsx but for the new digital/printed format.
// Key differences:
//   - No month/year/activity/price selectors: all extracted from the document
//   - Each row has pre-resolved activityId and loteId from the API
//   - Date coverage check uses full ISO dates from the extraction
// =============================================================================

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { ReviewTable, type ReviewRow } from "./review-table";
import { CreatePayPeriodWizard } from "./create-pay-period-wizard";
import { WorkerResolution, type UnmatchedItem, type WorkerResolutionResult } from "./worker-resolution";

type WorkerOption = { id: string; fullName: string };
type ActivityOption = {
  id: string;
  name: string;
  defaultPrice: number | null;
  priceSchedule?: { effectiveFrom: string; price: number }[];
};
type LoteOption = { id: string; name: string };
type PeriodOption = { id: string; periodNumber: number; startDate: string; endDate: string };

type WorkerMatch = {
  exactMatch: { id: string; fullName: string } | null;
  candidates: { id: string; fullName: string; score: number }[];
};

type EnrichedEntry = {
  date: string;
  lote: string;
  activity: string;
  units: number;
  resolvedActivityId: string | null;
  resolvedActivityName: string;
  resolvedActivityPrice: number;
  resolvedLoteId: string | null;
};

type RawRow = { rowNumber: number; cells: string[] };
type Anomaly = { row: RawRow; reason: string };

type XlsxFormatReport = {
  sheetChosen: string;
  columnRoles: Record<string, { index: number; header: string; via: string; confidence: number }>;
  unknownColumns: { index: number; header: string; sample: string[] }[];
  missingRoles: string[];
  driftDetected: boolean;
  driftReasons: string[];
};
type XlsxAnomalies = {
  flagged: Anomaly[];
  ignored: Anomaly[];
  incomplete: Anomaly[];
  unparseable: Anomaly[];
};
type XlsxCounts = {
  contentRows: number;
  entries: number;
  ignored: number;
  incomplete: number;
  unparseable: number;
  flagged: number;
  balanced: boolean;
};

type PlanillaApiResponse = {
  rows: { workerName: string; entries: EnrichedEntry[] }[];
  workerMatches: Record<string, WorkerMatch>;
  activities: ActivityOption[];
  lotes: LoteOption[];
  payPeriods: PeriodOption[];
  existingKeys: string[];
  unresolvedActivities: string[];
  unresolvedLotes: string[];
  dateRange: { start: string; end: string };
  confidence: string;
  notes: string;
  imageUrl: string;
  csvUrl: string;
  // Present only for .xlsx uploads:
  formatReport?: XlsxFormatReport;
  anomalies?: XlsxAnomalies;
  counts?: XlsxCounts;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Step = "upload" | "processing" | "worker-resolution" | "review" | "saving" | "done" | "no-period";

// =============================================================================
// Module-level helpers
// =============================================================================

function getUncoveredDates(result: PlanillaApiResponse, allPeriods: PeriodOption[]): string[] {
  const existingDateSet = new Set((result.existingKeys ?? []).map((k) => k.split("|")[0]));
  const allDates = [
    ...new Set(result.rows.flatMap((row) => row.entries.map((e) => e.date))),
  ];
  return allDates.filter(
    (d) =>
      !existingDateSet.has(d) &&
      !allPeriods.some((p) => d >= p.startDate && d <= p.endDate),
  );
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function buildReviewRows(
  result: PlanillaApiResponse,
  allPeriods: PeriodOption[],
): Promise<{
  reviewRows: ReviewRow[];
  skippedCount: number;
  workers: WorkerOption[];
}> {
  const existingKeySet = new Set(result.existingKeys ?? []);
  let skippedCount = 0;
  let rowId = 0;
  const reviewRows: ReviewRow[] = [];

  for (const extractedRow of result.rows) {
    const match = result.workerMatches[extractedRow.workerName];
    const matchedWorker = match?.exactMatch;

    for (const entry of extractedRow.entries) {
      if (matchedWorker && existingKeySet.has(`${entry.date}|${matchedWorker.id}`)) {
        skippedCount++;
        continue;
      }
      const period = allPeriods.find(
        (p) => entry.date >= p.startDate && entry.date <= p.endDate,
      );
      if (!period) continue;

      reviewRows.push({
        id: `row-${rowId++}`,
        workerName: extractedRow.workerName,
        workerId: matchedWorker?.id || null,
        workerConfidence: matchedWorker ? "exact" : match?.candidates.length ? "partial" : "none",
        activityId: entry.resolvedActivityId || "",
        loteId: entry.resolvedLoteId,
        date: entry.date,
        quantity: entry.units,
        unitPrice: entry.resolvedActivityPrice,
        totalEarned: Math.round(entry.units * entry.resolvedActivityPrice * 100) / 100,
        payPeriodId: period.id,
      });
    }
  }

  const workersRes = await fetch("/api/workers");
  const workersData = workersRes.ok ? await workersRes.json() : [];
  const workers: WorkerOption[] = workersData.map(
    (w: { id: string; fullName: string }) => ({ id: w.id, fullName: w.fullName }),
  );

  return { reviewRows, skippedCount, workers };
}

// =============================================================================
// Component
// =============================================================================

export function UploadPlanilla() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "xlsx" | null>(null);

  const [formatReport, setFormatReport] = useState<XlsxFormatReport | null>(null);
  const [anomalies, setAnomalies] = useState<XlsxAnomalies | null>(null);
  const [counts, setCounts] = useState<XlsxCounts | null>(null);

  const [pendingResult, setPendingResult] = useState<PlanillaApiResponse | null>(null);
  const [createdPeriods, setCreatedPeriods] = useState<PeriodOption[]>([]);
  const [wizardSuggestedStart, setWizardSuggestedStart] = useState<string | undefined>(undefined);

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [lotes, setLotes] = useState<LoteOption[]>([]);
  const [payPeriods, setPayPeriods] = useState<PeriodOption[]>([]);
  const [extractionNotes, setExtractionNotes] = useState("");
  const [confidence, setConfidence] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [unresolvedActivities, setUnresolvedActivities] = useState<string[]>([]);
  const [unresolvedLotes, setUnresolvedLotes] = useState<string[]>([]);
  const [detectedRange, setDetectedRange] = useState<{ start: string; end: string } | null>(null);
  const [unmatchedWorkers, setUnmatchedWorkers] = useState<UnmatchedItem[]>([]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);

    const isXlsx = f.type === XLSX_MIME || /\.xlsx$/i.test(f.name);
    if (isXlsx) {
      // Digital workbook — no image preview; show a file chip instead.
      setFileKind("xlsx");
      setPreview(null);
    } else {
      setFileKind("image");
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setError(null);
    setStep("processing");

    const isXlsx = fileKind === "xlsx";
    const ext = isXlsx
      ? "xlsx"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const contentType = isXlsx ? XLSX_MIME : file.type;

    try {
      // Get signed upload URL
      const urlRes = await fetch(
        `/api/planilla/signed-upload-url?ext=${ext}&contentType=${encodeURIComponent(contentType)}`,
      );
      const urlData = await urlRes.json();
      if (!urlRes.ok) {
        setError(urlData.error || "Error al generar URL de subida");
        setStep("upload");
        return;
      }

      // Upload directly to Supabase Storage
      const uploadRes = await fetch(urlData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadRes.ok) {
        setError("Error al subir el archivo al almacenamiento");
        setStep("upload");
        return;
      }

      // Process (image → OCR · .xlsx → parser); both return the same shape
      const res = await fetch("/api/planilla/process-planilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: urlData.path, contentType }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al procesar el archivo");
        setStep("upload");
        return;
      }

      const result = data as PlanillaApiResponse;

      // .xlsx that yielded no records — surface why instead of an empty table.
      if (result.counts && result.counts.entries === 0) {
        const missing = result.formatReport?.missingRoles ?? [];
        setError(
          missing.length
            ? `No se reconoció como planilla de actividades — faltan columnas: ${missing.join(", ")}.`
            : "El archivo no contiene registros de actividades reconocibles.",
        );
        setStep("upload");
        return;
      }

      setDetectedRange(result.dateRange ?? null);
      setFormatReport(result.formatReport ?? null);
      setAnomalies(result.anomalies ?? null);
      setCounts(result.counts ?? null);
      setPendingResult(result);

      // Check for unmatched workers — show resolution screen before proceeding
      const unmatched: UnmatchedItem[] = Object.entries(result.workerMatches)
        .filter(([, m]) => !m.exactMatch)
        .map(([name, m]) => ({ extractedName: name, candidates: m.candidates }));

      if (unmatched.length > 0) {
        setUnmatchedWorkers(unmatched);
        setStep("worker-resolution");
        return;
      }

      await continueAfterWorkers(result, result.payPeriods);
    } catch {
      setError("Error de conexión");
      setStep("upload");
    }
  }, [file, fileKind]);

  // Shared: proceed from a validated result to period-check → review
  async function continueAfterWorkers(result: PlanillaApiResponse, allPeriods: PeriodOption[]) {
    const uncovered = getUncoveredDates(result, allPeriods);
    if (uncovered.length > 0) {
      setCreatedPeriods([]);
      setWizardSuggestedStart(uncovered.sort()[0]);
      setStep("no-period");
      return;
    }
    const { reviewRows, skippedCount: sc, workers: workerList } = await buildReviewRows(
      result,
      allPeriods,
    );
    setSkippedCount(sc);
    setRows(reviewRows);
    setWorkers(workerList);
    setActivities(result.activities);
    setLotes(result.lotes);
    setPayPeriods(allPeriods);
    setExtractionNotes(result.notes);
    setConfidence(result.confidence);
    setImageUrl(result.imageUrl);
    setCsvUrl(result.csvUrl);
    setUnresolvedActivities(result.unresolvedActivities ?? []);
    setUnresolvedLotes(result.unresolvedLotes ?? []);
    setStep("review");
  }

  // Called by WorkerResolution when all names are resolved
  async function handleWorkersResolved(results: WorkerResolutionResult[]) {
    if (!pendingResult) return;
    setStep("processing");

    const updatedMatches = { ...pendingResult.workerMatches };
    for (const r of results) {
      updatedMatches[r.extractedName] = {
        exactMatch: { id: r.workerId, fullName: r.workerFullName },
        candidates: [],
      };
    }
    const updatedResult = { ...pendingResult, workerMatches: updatedMatches };
    setPendingResult(updatedResult);

    await continueAfterWorkers(updatedResult, updatedResult.payPeriods);
  }

  async function handlePeriodCreated(newPeriod: PeriodOption) {
    if (!pendingResult) return;

    const allCreated = [...createdPeriods, newPeriod];
    setCreatedPeriods(allCreated);

    const allPeriods = [...pendingResult.payPeriods, ...allCreated];
    const uncovered = getUncoveredDates(pendingResult, allPeriods);

    if (uncovered.length > 0) {
      const latestEnd = allPeriods.map((p) => p.endDate).sort().at(-1)!;
      setWizardSuggestedStart(addOneDay(latestEnd));
      return;
    }

    setStep("processing");
    await continueAfterWorkers(pendingResult, allPeriods);
  }

  const handleSave = useCallback(async () => {
    const validRows = rows.filter((r) => r.workerId && r.activityId && r.payPeriodId);
    if (validRows.length === 0) {
      setError("No hay filas válidas para guardar");
      return;
    }
    setError(null);
    setStep("saving");

    const correctionMap = new Map<string, { workerId: string; workerFullName: string }>();
    for (const r of validRows) {
      if (r.workerId && r.workerName && !correctionMap.has(r.workerName)) {
        const worker = workers.find((w) => w.id === r.workerId);
        if (worker)
          correctionMap.set(r.workerName, { workerId: r.workerId, workerFullName: worker.fullName });
      }
    }
    const corrections = Array.from(correctionMap.entries()).map(
      ([handwritten, { workerId, workerFullName }]) => ({
        handwritten,
        canonical: workerFullName,
        category: "worker" as const,
        referenceId: workerId,
      }),
    );

    try {
      const res = await fetch("/api/planilla/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            workerId: r.workerId,
            activityId: r.activityId,
            loteId: r.loteId,
            date: r.date,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            totalEarned: r.totalEarned,
            payPeriodId: r.payPeriodId,
          })),
          corrections,
          imageUrl,
          csvUrl,
        }),
      });

      const saveData = await res.json();
      if (!res.ok) {
        setError(saveData.error || "Error al guardar");
        setStep("review");
        return;
      }
      setSavedCount(saveData.count);
      setStep("done");
    } catch {
      setError("Error de conexión");
      setStep("review");
    }
  }, [rows, workers, imageUrl, csvUrl]);

  const handleUpdateRow = useCallback((id: string, updates: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }, []);

  const handleDeleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ── STEP: Upload ──────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-finca-700">
            Planilla semanal — foto o archivo Excel
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-finca-300 bg-finca-50/50 px-6 py-8 transition-colors hover:border-finca-500 hover:bg-finca-50">
            <input
              type="file"
              accept={`image/jpeg,image/png,image/webp,.xlsx,${XLSX_MIME}`}
              onChange={handleFileSelect}
              className="hidden"
            />
            {fileKind === "image" && preview ? (
              <Image src={preview} alt="Vista previa" width={400} height={256} className="max-h-64 rounded-lg object-contain" unoptimized />
            ) : fileKind === "xlsx" && file ? (
              <div className="flex flex-col items-center">
                <FileSpreadsheet className="mb-3 h-10 w-10 text-emerald-600" />
                <p className="text-sm font-medium text-finca-800">{file.name}</p>
                <p className="mt-1 text-xs text-finca-400">
                  {(file.size / 1024).toFixed(0)} KB · archivo Excel
                </p>
              </div>
            ) : (
              <>
                <FileSpreadsheet className="mb-3 h-10 w-10 text-finca-400" />
                <p className="text-sm font-medium text-finca-700">
                  Tomar foto o seleccionar archivo
                </p>
                <p className="mt-1 text-xs text-finca-400">Imagen (JPEG, PNG, WebP) o Excel (.xlsx)</p>
                <p className="mt-2 text-xs text-finca-400">
                  Las fechas y actividades se extraen automáticamente
                </p>
              </>
            )}
          </label>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          Procesar Planilla
        </button>
      </div>
    );
  }

  // ── STEP: Worker resolution ───────────────────────────────────────────────
  if (step === "worker-resolution") {
    return (
      <WorkerResolution
        unmatched={unmatchedWorkers}
        onResolved={handleWorkersResolved}
        onCancel={() => {
          setStep("upload");
          setPendingResult(null);
          setUnmatchedWorkers([]);
        }}
      />
    );
  }

  // ── STEP: No open pay period ──────────────────────────────────────────────
  if (step === "no-period") {
    const rangeLabel = detectedRange
      ? `${detectedRange.start} – ${detectedRange.end}`
      : "las fechas detectadas";

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              {createdPeriods.length === 0 ? (
                <>
                  No hay período de pago abierto para <strong>{rangeLabel}</strong>.
                  Créelo a continuación para continuar.
                </>
              ) : (
                <>
                  <span className="font-medium">
                    {createdPeriods.length === 1
                      ? `Período ${createdPeriods[0].periodNumber} creado.`
                      : `${createdPeriods.length} períodos creados.`}
                  </span>
                  {" Hay fechas que aún no tienen período. Cree el siguiente."}
                </>
              )}
            </div>
          </div>
        </div>

        <CreatePayPeriodWizard
          key={createdPeriods.length}
          onCreated={handlePeriodCreated}
          suggestedStartDate={wizardSuggestedStart}
          initialStep={2}
        />

        <button
          onClick={() => {
            setStep("upload");
            setPendingResult(null);
            setCreatedPeriods([]);
          }}
          className="text-sm text-finca-500 hover:text-finca-700 underline"
        >
          Cancelar y volver
        </button>
      </div>
    );
  }

  // ── STEP: Processing ──────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-finca-600" />
        <p className="mt-4 text-sm font-medium text-finca-700">Procesando planilla con IA...</p>
        <p className="mt-1 text-xs text-finca-400">Esto puede tomar 10-30 segundos</p>
      </div>
    );
  }

  // ── STEP: Review ──────────────────────────────────────────────────────────
  if (step === "review") {
    const validCount = rows.filter((r) => r.workerId).length;
    const unmatchedCount = rows.filter((r) => !r.workerId).length;
    const missingActivity = rows.filter((r) => !r.activityId).length;

    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {skippedCount > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="font-medium">
              {skippedCount === 1 ? "1 registro omitido" : `${skippedCount} registros omitidos`}
            </span>
            {" — ya importados previamente"}
          </div>
        )}

        {(unresolvedActivities.length > 0 || unresolvedLotes.length > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Códigos no reconocidos — verifique en la tabla:</p>
            {unresolvedActivities.length > 0 && (
              <p className="mt-1">
                Actividades: <span className="font-mono">{unresolvedActivities.join(", ")}</span>
              </p>
            )}
            {unresolvedLotes.length > 0 && (
              <p className="mt-1">
                Lotes: <span className="font-mono">{unresolvedLotes.join(", ")}</span>
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-finca-200 bg-finca-50/50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                confidence === "high"
                  ? "bg-emerald-100 text-emerald-700"
                  : confidence === "medium"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              Confianza:{" "}
              {confidence === "high" ? "Alta" : confidence === "medium" ? "Media" : "Baja"}
            </span>
            {unmatchedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {unmatchedCount} trabajador(es) sin coincidencia
              </span>
            )}
            {missingActivity > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {missingActivity} fila(s) sin actividad
              </span>
            )}
          </div>
          {extractionNotes && (
            <p className="mt-2 text-xs text-finca-500">{extractionNotes}</p>
          )}
        </div>

        {/* .xlsx parser report — balance proof, format drift, and every row
            that did NOT become a normal record (nothing left behind). */}
        {counts && (
          <div className="space-y-3">
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                counts.balanced
                  ? "border-finca-200 bg-finca-50/50 text-finca-700"
                  : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              <p className="font-medium">
                {counts.balanced ? "✓ Lectura balanceada" : "✗ La lectura NO cuadra — revisar"}
              </p>
              <p className="mt-1 text-xs">
                {counts.contentRows} fila(s) leídas = {counts.entries} registro(s)
                {counts.flagged > 0 && ` (${counts.flagged} marcadas, cantidad vacía/cero)`} +{" "}
                {counts.ignored} ignorada(s) + {counts.incomplete} incompleta(s) +{" "}
                {counts.unparseable} sin clasificar.
              </p>
              {formatReport && (
                <p className="mt-1 text-xs text-finca-500">
                  Hoja: <span className="font-mono">{formatReport.sheetChosen}</span>
                  {formatReport.driftDetected
                    ? ` · ⚠ Formato modificado: ${formatReport.driftReasons.join(" ")}`
                    : " · formato reconocido"}
                  {formatReport.missingRoles.length > 0 &&
                    ` · Columnas faltantes: ${formatReport.missingRoles.join(", ")}`}
                </p>
              )}
            </div>

            {anomalies &&
              (
                [
                  ["Filas ignoradas (totales/resumen)", anomalies.ignored],
                  ["Líneas incompletas", anomalies.incomplete],
                  ["Filas sin clasificar", anomalies.unparseable],
                ] as const
              )
                .filter(([, items]) => items.length > 0)
                .map(([label, items]) => (
                  <details key={label} className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2 text-sm">
                    <summary className="cursor-pointer font-medium text-amber-800">
                      {label} ({items.length})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {items.map((it, i) => (
                        <div key={i} className="text-xs text-amber-900">
                          <span className="text-amber-600">Fila {it.row.rowNumber}:</span> {it.reason}
                          <div className="mt-0.5 truncate font-mono text-[11px] text-finca-500">
                            {it.row.cells.filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
          </div>
        )}

        <ReviewTable
          rows={rows}
          workers={workers}
          activities={activities}
          lotes={lotes}
          payPeriods={payPeriods}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={validCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            Guardar {validCount} Registros
          </button>
          <button
            onClick={() => {
              setStep("upload");
              setRows([]);
              setFile(null);
              setPreview(null);
              setFileKind(null);
              setFormatReport(null);
              setAnomalies(null);
              setCounts(null);
            }}
            className="rounded-lg border border-finca-200 px-4 py-2.5 text-sm font-medium text-finca-600 transition-colors hover:bg-finca-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── STEP: Saving ──────────────────────────────────────────────────────────
  if (step === "saving") {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-finca-600" />
        <p className="mt-4 text-sm font-medium text-finca-700">Guardando registros...</p>
      </div>
    );
  }

  // ── STEP: Done ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle className="h-8 w-8 text-emerald-600" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-finca-900">
        {savedCount} registros guardados
      </h3>
      <p className="mt-1 text-sm text-finca-500">
        Los datos de la planilla fueron importados exitosamente.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => {
            setStep("upload");
            setRows([]);
            setFile(null);
            setPreview(null);
            setFileKind(null);
            setFormatReport(null);
            setAnomalies(null);
            setCounts(null);
            setSavedCount(0);
            setPendingResult(null);
            setCreatedPeriods([]);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-finca-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Subir otra planilla
        </button>
        <button
          onClick={() => router.push("/planilla" as never)}
          className="inline-flex items-center gap-2 rounded-lg border border-finca-200 px-4 py-2.5 text-sm font-medium text-finca-600 hover:bg-finca-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver Planilla
        </button>
      </div>
    </div>
  );
}
