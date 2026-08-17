// =============================================================================
// src/app/api/feedback/route.ts — Intake for the "Reportar" widget.
//
// ORDER IS THE CONTRACT — do not reorder:
//
//   1. authenticate + authorize   → identity comes from the SESSION, never the body
//   2. validate                   → server-authoritative; the client's check is only UX
//   3. INSERT the report          → THIS is what makes the request a success
//   4. upload the screenshot      → best effort
//   5. send the notification      → best effort
//   6. record the outcome on the row
//
// Steps 4–6 never change the status code. A failed email is a 201 with
// emailed:false, because the user's job is done and delivery is our problem —
// recorded on the row for us to chase. A failed INSERT is a 500, because that is
// the only case where the report was actually lost and retrying is the user's
// only recourse.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, BUG_REPORT_ROLES } from "@/lib/auth/guards";
import {
  bugReportSchema,
  BUG_REPORT_AUTOR_MAX,
  type BugReportMeta,
} from "@/lib/validators/bug-report";
import { uploadScreenshot } from "@/lib/feedback/screenshot-storage";
import { sendBugReportEmail } from "@/lib/feedback/email";

export async function POST(request: NextRequest) {
  // 1 ─ Identity from the session. A client-declared identity is unauthenticated.
  const auth = await apiRequireRole(...BUG_REPORT_ROLES);
  if (auth instanceof NextResponse) return auth;

  // 2 ─ Server-authoritative validation.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = bugReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 3 ─ Persist. Everything after this point is best effort.
  let report;
  try {
    report = await prisma.bugReport.create({
      data: {
        userId: auth.id,
        autor: auth.name.slice(0, BUG_REPORT_AUTOR_MAX),
        email: auth.email,
        role: auth.role,
        kind: input.kind,
        donde: input.kind === "DATO_INCORRECTO" ? input.donde : null,
        appDice: input.kind === "DATO_INCORRECTO" ? input.appDice : null,
        appDeberiaDecir:
          input.kind === "DATO_INCORRECTO" ? input.appDeberiaDecir : null,
        queFalta: input.kind === "FALTA_ALGO" ? input.queFalta : null,
        url: input.url,
        meta: input.meta,
        screenshotError: input.screenshot ? null : "La captura falló en el navegador",
      },
      select: { id: true, createdAt: true },
    });
  } catch (error) {
    console.error("[Reportar] No se pudo guardar el reporte:", error);
    return NextResponse.json(
      { error: "No se pudo guardar. Intenta de nuevo." },
      { status: 500 },
    );
  }

  // 4 ─ Screenshot to the private bucket. A Storage outage costs the image, not
  //     the report — the row above already exists.
  let screenshotPath: string | null = null;
  let screenshotError: string | null = input.screenshot
    ? null
    : "La captura falló en el navegador";

  if (input.screenshot) {
    const upload = await uploadScreenshot(
      report.id,
      report.createdAt,
      input.screenshot,
    );
    screenshotPath = upload.path;
    screenshotError = upload.error;
    if (upload.error) {
      console.error("[Reportar] No se pudo subir la captura:", upload.error);
    }
  }

  // 5 ─ Notify. Carries a link to /admin/reportes, never the image itself.
  const email = await sendBugReportEmail({
    id: report.id,
    createdAt: report.createdAt,
    autor: auth.name,
    email: auth.email,
    role: auth.role,
    kind: input.kind,
    donde: input.kind === "DATO_INCORRECTO" ? input.donde : null,
    appDice: input.kind === "DATO_INCORRECTO" ? input.appDice : null,
    appDeberiaDecir:
      input.kind === "DATO_INCORRECTO" ? input.appDeberiaDecir : null,
    queFalta: input.kind === "FALTA_ALGO" ? input.queFalta : null,
    url: input.url,
    meta: input.meta as BugReportMeta,
    hasScreenshot: screenshotPath !== null,
    screenshotError,
  });

  // 6 ─ Record what happened. Failing here must not fail the user's request:
  //     the report is stored and the user is done.
  try {
    await prisma.bugReport.update({
      where: { id: report.id },
      data: {
        screenshotPath,
        screenshotError,
        emailStatus: email.status,
        resendId: email.resendId,
        emailError: email.error,
      },
    });
  } catch (error) {
    console.error("[Reportar] No se pudo registrar el resultado del envío:", error);
  }

  return NextResponse.json(
    { ok: true, id: report.id, emailed: email.status === "SENT" },
    { status: 201 },
  );
}
