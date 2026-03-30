// =============================================================================
// POST /api/planilla/upload-foto
// Receives notebook photo, uploads to storage, extracts data via Claude Vision,
// matches workers, returns structured data for user review.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { extractNotebookData } from "@/lib/ai/extract-notebook";
import { matchAllWorkers } from "@/lib/ai/match-workers";
import { prisma } from "@/lib/prisma";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const month = parseInt(formData.get("month") as string, 10);
    const year = parseInt(formData.get("year") as string, 10);
    const activityName = (formData.get("activityName") as string) || undefined;
    const unitPrice = formData.get("unitPrice")
      ? parseFloat(formData.get("unitPrice") as string)
      : undefined;

    if (!file) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    if (!month || !year || isNaN(month) || isNaN(year)) {
      return NextResponse.json({ error: "Mes y año son requeridos" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de imagen no soportado. Use JPEG, PNG o WebP." },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "La imagen es demasiado grande. Máximo 10MB." },
        { status: 400 },
      );
    }

    // 1. Upload image to Supabase Storage
    const supabase = createServiceClient();
    const agYear = getCurrentAgriculturalYear();
    const timestamp = Date.now();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `planilla/${agYear}/${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("notebook-photos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Error al subir imagen: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // 2. Call Claude Vision to extract data
    const base64 = buffer.toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";

    let extraction;
    try {
      extraction = await extractNotebookData(base64, mediaType, {
        month,
        year,
        activityName,
        unitPrice,
      });
    } catch (aiError) {
      console.error("AI extraction error:", aiError);
      return NextResponse.json(
        {
          error: `Error al procesar la imagen: ${aiError instanceof Error ? aiError.message : "Error desconocido"}`,
          imageUrl: storagePath,
        },
        { status: 422 },
      );
    }

    // 3. Match worker names to DB records
    const workers = await prisma.worker.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
    });

    const extractedNames = extraction.rows.map((r) => r.workerName);
    const workerMatches = matchAllWorkers(extractedNames, workers);

    // 4. Fetch activities and lotes for the review UI
    const activities = await prisma.activity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true, defaultPrice: true },
      orderBy: { sortOrder: "asc" },
    });

    const lotes = await prisma.lote.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { sortOrder: "asc" },
    });

    // 5. Find or suggest pay period
    const payPeriods = await prisma.payPeriod.findMany({
      where: { agriculturalYear: agYear, isClosed: false },
      orderBy: { periodNumber: "desc" },
    });

    // 6. Build CSV string for audit storage
    const csvLines = ["worker_name,day,quantity,matched_worker_id,confidence"];
    for (const row of extraction.rows) {
      const match = workerMatches[row.workerName];
      for (const entry of row.entries) {
        csvLines.push(
          `"${row.workerName}",${entry.day},${entry.quantity},${match?.exactMatch?.id || ""},${match?.exactMatch ? "exact" : match?.candidates.length ? "partial" : "none"}`,
        );
      }
    }
    const csvContent = csvLines.join("\n");

    // Upload CSV
    const csvPath = storagePath.replace(/\.\w+$/, ".csv");
    await supabase.storage
      .from("notebook-photos")
      .upload(csvPath, csvContent, {
        contentType: "text/csv",
        upsert: false,
      });

    // 7. Return extraction result for user review
    return NextResponse.json({
      extraction,
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
      })),
      lotes: lotes.map((l) => ({ id: l.id, name: l.name })),
      payPeriods: payPeriods.map((p) => ({
        id: p.id,
        periodNumber: p.periodNumber,
        startDate: p.startDate.toISOString().split("T")[0],
        endDate: p.endDate.toISOString().split("T")[0],
      })),
      imageUrl: storagePath,
      csvUrl: csvPath,
    });
  } catch (error) {
    console.error("Upload-foto error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
