// =============================================================================
// POST /api/planilla/process-foto
// Receives the storage path of an already-uploaded notebook photo, downloads it
// from Supabase Storage, runs Claude Vision extraction, matches workers, and
// returns structured data for the review UI.
//
// This route replaces upload-foto — the image is uploaded directly from the
// browser to Supabase Storage via a signed URL, so the Vercel body-size limit
// (4.5 MB on Hobby) is no longer a bottleneck.
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
    const body = await request.json();
    const { storagePath, contentType, month, year, activityName, unitPrice } =
      body as {
        storagePath: string;
        contentType: string;
        month: number;
        year: number;
        activityName?: string;
        unitPrice?: number;
      };

    if (!storagePath || !month || !year) {
      return NextResponse.json(
        { error: "storagePath, mes y año son requeridos" },
        { status: 400 },
      );
    }

    // 1. Download image from Supabase Storage
    const supabase = createServiceClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notebook-photos")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { error: `Error al descargar imagen: ${downloadError?.message || "Archivo no encontrado"}` },
        { status: 500 },
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Call Claude Vision to extract data
    const base64 = buffer.toString("base64");
    const mediaType = (contentType || "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/webp";

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
    const agYear = getCurrentAgriculturalYear();
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
    console.error("Process-foto error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
