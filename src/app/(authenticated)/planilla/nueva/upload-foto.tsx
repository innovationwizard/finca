"use client";

// =============================================================================
// Upload notebook photo, extract via AI, review, and save to DB.
// =============================================================================

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { ReviewTable, type ReviewRow } from "./review-table";
import { CreatePayPeriodWizard } from "./create-pay-period-wizard";

type WorkerOption = { id: string; fullName: string };
type ActivityOption = { id: string; name: string; defaultPrice: number | null };
type LoteOption = { id: string; name: string };
type PeriodOption = { id: string; periodNumber: number; startDate: string; endDate: string };

type WorkerMatch = {
  exactMatch: { id: string; fullName: string } | null;
  candidates: { id: string; fullName: string; score: number }[];
};

type ExtractionResponse = {
  extraction: {
    rows: { workerName: string; entries: { day: number; quantity: number }[] }[];
    month?: number;
    year?: number;
    confidence: string;
    notes: string;
  };
  workerMatches: Record<string, WorkerMatch>;
  activities: ActivityOption[];
  lotes: LoteOption[];
  payPeriods: PeriodOption[];
  existingDates: string[];
  imageUrl: string;
  csvUrl: string;
};

type Step = "upload" | "processing" | "review" | "saving" | "done" | "no-period";

// =============================================================================
// Module-level helpers — no component state captured
// =============================================================================

function periodCoversDate(dateStr: string, period: PeriodOption): boolean {
  return dateStr >= period.startDate && dateStr <= period.endDate;
}

function getUncoveredDates(
  result: ExtractionResponse,
  allPeriods: PeriodOption[],
  effMonth: number,
  effYear: number,
): string[] {
  const existingDateSet = new Set(result.existingDates ?? []);
  const allDates = [
    ...new Set(
      result.extraction.rows.flatMap((row) =>
        row.entries.map(
          (e) =>
            `${effYear}-${String(effMonth).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`,
        ),
      ),
    ),
  ];
  return allDates.filter(
    (d) => !existingDateSet.has(d) && !allPeriods.some((p) => periodCoversDate(d, p)),
  );
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function buildReviewRows(
  result: ExtractionResponse,
  allPeriods: PeriodOption[],
  effMonth: number,
  effYear: number,
  activityFilter: string,
  priceFilter: string,
): Promise<{
  reviewRows: ReviewRow[];
  skippedDays: number[];
  workers: WorkerOption[];
}> {
  const existingDateSet = new Set(result.existingDates ?? []);
  const collectedSkippedDays = new Set<number>();
  const defaultActivity = result.activities[0];
  let rowId = 0;
  const reviewRows: ReviewRow[] = [];

  for (const extractedRow of result.extraction.rows) {
    const match = result.workerMatches[extractedRow.workerName];
    const matchedWorker = match?.exactMatch;
    const actObj = activityFilter
      ? result.activities.find((a) => a.name === activityFilter) || defaultActivity
      : defaultActivity;
    const price = priceFilter ? parseFloat(priceFilter) : actObj?.defaultPrice ?? 0;

    for (const entry of extractedRow.entries) {
      const dateStr = `${effYear}-${String(effMonth).padStart(2, "0")}-${String(entry.day).padStart(2, "0")}`;
      if (existingDateSet.has(dateStr)) {
        collectedSkippedDays.add(entry.day);
        continue;
      }
      const period = allPeriods.find((p) => periodCoversDate(dateStr, p));
      if (!period) continue;
      reviewRows.push({
        id: `row-${rowId++}`,
        workerName: extractedRow.workerName,
        workerId: matchedWorker?.id || null,
        workerConfidence: matchedWorker ? "exact" : match?.candidates.length ? "partial" : "none",
        activityId: actObj?.id || "",
        loteId: null,
        date: dateStr,
        quantity: entry.quantity,
        unitPrice: price,
        totalEarned: Math.round(entry.quantity * price * 100) / 100,
        payPeriodId: period.id,
      });
    }
  }

  const workersRes = await fetch("/api/workers");
  const workersData = workersRes.ok ? await workersRes.json() : [];
  const workers: WorkerOption[] = workersData.map(
    (w: { id: string; fullName: string }) => ({ id: w.id, fullName: w.fullName }),
  );

  return {
    reviewRows,
    skippedDays: [...collectedSkippedDays].sort((a, b) => a - b),
    workers,
  };
}

// =============================================================================
// Component
// =============================================================================

export function UploadFoto() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedActivity, setSelectedActivity] = useState("");
  const [selectedUnitPrice, setSelectedUnitPrice] = useState("");

  // Pending extraction — kept while user creates periods
  const [pendingResult, setPendingResult] = useState<ExtractionResponse | null>(null);
  const [createdPeriods, setCreatedPeriods] = useState<PeriodOption[]>([]);
  const [wizardSuggestedStart, setWizardSuggestedStart] = useState<string | undefined>(undefined);

  // Review state
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
  const [skippedDates, setSkippedDates] = useState<string[]>([]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  // Step 1 → 2: Upload directly to Supabase Storage, then process via AI
  const handleUpload = useCallback(async () => {
    if (!file) return;
    setError(null);
    setStep("processing");

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

    try {
      // 1. Get signed upload URL
      const urlRes = await fetch(
        `/api/planilla/signed-upload-url?ext=${ext}&contentType=${encodeURIComponent(file.type)}`,
      );
      const urlData = await urlRes.json();
      if (!urlRes.ok) {
        setError(urlData.error || "Error al generar URL de subida");
        setStep("upload");
        return;
      }

      // 2. Upload image directly to Supabase Storage (bypasses Vercel 4.5 MB limit)
      const uploadRes = await fetch(urlData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setError("Error al subir la imagen al almacenamiento");
        setStep("upload");
        return;
      }

      // 3. Process via AI
      const res = await fetch("/api/planilla/process-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: urlData.path,
          contentType: file.type,
          month,
          year,
          activityName: selectedActivity || undefined,
          unitPrice: selectedUnitPrice ? parseFloat(selectedUnitPrice) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al procesar la imagen");
        setStep("upload");
        return;
      }

      const result = data as ExtractionResponse;

      // Use AI-extracted month/year if valid; otherwise keep form values
      const effMonth =
        typeof result.extraction.month === "number" &&
        result.extraction.month >= 1 &&
        result.extraction.month <= 12
          ? result.extraction.month
          : month;
      const effYear =
        typeof result.extraction.year === "number" &&
        result.extraction.year >= 2020 &&
        result.extraction.year <= 2040
          ? result.extraction.year
          : year;
      setMonth(effMonth);
      setYear(effYear);

      // 4. Check if all needed dates are covered by existing open periods
      const uncovered = getUncoveredDates(result, result.payPeriods, effMonth, effYear);

      if (uncovered.length > 0) {
        // Need to create one or more periods before we can proceed
        setPendingResult(result);
        setCreatedPeriods([]);
        setWizardSuggestedStart(uncovered.sort()[0]);
        setStep("no-period");
        return;
      }

      // All dates covered — build review rows directly
      const { reviewRows, skippedDays, workers: workerList } = await buildReviewRows(
        result, result.payPeriods, effMonth, effYear, selectedActivity, selectedUnitPrice,
      );
      setSkippedDates(
        skippedDays.map((d) => `${effYear}-${String(effMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
      );
      setRows(reviewRows);
      setWorkers(workerList);
      setActivities(result.activities);
      setLotes(result.lotes);
      setPayPeriods(result.payPeriods);
      setExtractionNotes(result.extraction.notes);
      setConfidence(result.extraction.confidence);
      setImageUrl(result.imageUrl);
      setCsvUrl(result.csvUrl);
      setStep("review");
    } catch {
      setError("Error de conexión");
      setStep("upload");
    }
  }, [file, month, year, selectedActivity, selectedUnitPrice]);

  // Called by CreatePayPeriodWizard each time a period is successfully created
  async function handlePeriodCreated(newPeriod: PeriodOption) {
    if (!pendingResult) return;

    const allCreated = [...createdPeriods, newPeriod];
    setCreatedPeriods(allCreated);

    const allPeriods = [...pendingResult.payPeriods, ...allCreated];
    const uncovered = getUncoveredDates(pendingResult, allPeriods, month, year);

    if (uncovered.length > 0) {
      // More periods needed — suggest starting the day after the latest period ends
      const latestEnd = allPeriods.map((p) => p.endDate).sort().at(-1)!;
      setWizardSuggestedStart(addOneDay(latestEnd));
      // key={createdPeriods.length} on the wizard causes remount with fresh state
      return;
    }

    // All dates now covered — build review rows
    setStep("processing");
    const { reviewRows, skippedDays, workers: workerList } = await buildReviewRows(
      pendingResult, allPeriods, month, year, selectedActivity, selectedUnitPrice,
    );
    setSkippedDates(
      skippedDays.map((d) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    );
    setRows(reviewRows);
    setWorkers(workerList);
    setActivities(pendingResult.activities);
    setLotes(pendingResult.lotes);
    setPayPeriods(allPeriods);
    setExtractionNotes(pendingResult.extraction.notes);
    setConfidence(pendingResult.extraction.confidence);
    setImageUrl(pendingResult.imageUrl);
    setCsvUrl(pendingResult.csvUrl);
    setStep("review");
  }

  // Step 3 → 4: Save confirmed rows
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
        if (worker) correctionMap.set(r.workerName, { workerId: r.workerId, workerFullName: worker.fullName });
      }
    }
    const corrections = Array.from(correctionMap.entries()).map(([handwritten, { workerId, workerFullName }]) => ({
      handwritten,
      canonical: workerFullName,
      category: "worker" as const,
      referenceId: workerId,
    }));

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
            Foto del cuaderno
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-finca-300 bg-finca-50/50 px-6 py-8 transition-colors hover:border-finca-500 hover:bg-finca-50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            {preview ? (
              <img src={preview} alt="Vista previa" className="max-h-64 rounded-lg object-contain" />
            ) : (
              <>
                <Camera className="mb-3 h-10 w-10 text-finca-400" />
                <p className="text-sm font-medium text-finca-700">Tomar foto o seleccionar imagen</p>
                <p className="mt-1 text-xs text-finca-400">JPEG, PNG o WebP</p>
              </>
            )}
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm"
            >
              {[
                "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
              ].map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">Año</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              min={2024}
              max={2030}
              className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Actividad principal (opcional)
            </label>
            <input
              type="text"
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              placeholder="Ej: Corte de Café"
              className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-finca-700">
              Precio unitario (opcional)
            </label>
            <input
              type="number"
              step="0.01"
              value={selectedUnitPrice}
              onChange={(e) => setSelectedUnitPrice(e.target.value)}
              placeholder="Ej: 70"
              className="w-full rounded-lg border border-finca-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          Procesar Foto
        </button>
      </div>
    );
  }

  // ── STEP: No open pay period — show wizard inline ─────────────────────────
  if (step === "no-period") {
    const MONTH_NAMES = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const detectedLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              {createdPeriods.length === 0 ? (
                <>
                  No hay período de pago abierto para <strong>{detectedLabel}</strong>.
                  Créelo a continuación para continuar.
                </>
              ) : (
                <>
                  <span className="font-medium">
                    {createdPeriods.length === 1
                      ? `Período ${createdPeriods[0].periodNumber} creado.`
                      : `${createdPeriods.length} períodos creados.`}
                  </span>
                  {" Hay fechas de "}
                  <strong>{detectedLabel}</strong>
                  {" que aún no tienen período. Cree el siguiente."}
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
        <p className="mt-4 text-sm font-medium text-finca-700">Procesando imagen con IA...</p>
        <p className="mt-1 text-xs text-finca-400">Esto puede tomar 10-30 segundos</p>
      </div>
    );
  }

  // ── STEP: Review ──────────────────────────────────────────────────────────
  if (step === "review") {
    const validCount = rows.filter((r) => r.workerId).length;
    const unmatchedCount = rows.filter((r) => !r.workerId).length;

    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {skippedDates.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="font-medium">
              {skippedDates.length === 1 ? "1 día omitido" : `${skippedDates.length} días omitidos`}
            </span>
            {" — ya importados previamente (días: "}
            {skippedDates.map((d) => parseInt(d.split("-")[2], 10)).join(", ")}
            {")"}
          </div>
        )}

        <div className="rounded-lg border border-finca-200 bg-finca-50/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              confidence === "high"
                ? "bg-emerald-100 text-emerald-700"
                : confidence === "medium"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
            }`}>
              Confianza: {confidence === "high" ? "Alta" : confidence === "medium" ? "Media" : "Baja"}
            </span>
            {unmatchedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {unmatchedCount} trabajador(es) sin coincidencia
              </span>
            )}
          </div>
          {extractionNotes && (
            <p className="mt-2 text-xs text-finca-500">{extractionNotes}</p>
          )}
        </div>

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
        Los datos del cuaderno fueron importados exitosamente.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => {
            setStep("upload");
            setRows([]);
            setFile(null);
            setPreview(null);
            setSavedCount(0);
            setPendingResult(null);
            setCreatedPeriods([]);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-finca-800"
        >
          <Camera className="h-4 w-4" />
          Subir otra foto
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
