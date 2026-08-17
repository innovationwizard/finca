// =============================================================================
// src/lib/feedback/email.ts — Notification for a stored bug report.
//
// SERVER ONLY. Reads RESEND_API_KEY; never import from a "use client" module.
//
// ⚠️ THE EMAIL CARRIES NO SCREENSHOT, BY DESIGN.
// A viewport capture of this app contains payroll data — worker names, wages,
// séptimo, descuentos, net pay, sometimes bank accounts. Attaching it would copy
// that into every recipient's mailbox and into the mail provider's logs, outside
// the app's access control and outside any retention policy we run. Instead the
// mail carries an authenticated deep link to /admin/reportes?id=…, which requires
// a session and a MASTER/ADMIN role to open. The link holds no token and grants
// nothing on its own: forwarding it leaks a URL, not data.
//
// This module never throws. The report is already stored by the time it runs; a
// mail failure is recorded on the row (email_status = FAILED) and chased later,
// it does not fail the user's request.
// =============================================================================

import { Resend } from "resend";
import type { UserRole } from "@prisma/client";
import type { BugReportMeta } from "@/lib/validators/bug-report";

export type BugReportEmailInput = {
  id: string;
  createdAt: Date;
  autor: string;
  email: string;
  role: UserRole;
  kind: "DATO_INCORRECTO" | "FALTA_ALGO";
  donde: string | null;
  appDice: string | null;
  appDeberiaDecir: string | null;
  queFalta: string | null;
  url: string;
  meta: BugReportMeta;
  hasScreenshot: boolean;
  screenshotError: string | null;
};

export type BugReportEmailResult =
  | { status: "SENT"; resendId: string | null; error: null }
  | { status: "FAILED"; resendId: null; error: string }
  | { status: "NOT_CONFIGURED"; resendId: null; error: string };

const KIND_LABEL: Record<BugReportEmailInput["kind"], string> = {
  DATO_INCORRECTO: "Dato incorrecto",
  FALTA_ALGO: "Falta algo",
};

/**
 * The reporter is authenticated, but the field contents are arbitrary text.
 * Everything interpolated into the HTML body goes through here.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function recipients(): string[] {
  return (process.env.BUG_REPORT_TO ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

function row(label: string, value: string): string {
  return `<tr>
      <td style="padding:6px 12px 6px 0;vertical-align:top;color:#6b7280;white-space:nowrap;">${esc(label)}</td>
      <td style="padding:6px 0;vertical-align:top;color:#111827;">${esc(value)}</td>
    </tr>`;
}

function buildHtml(report: BugReportEmailInput, reportLink: string): string {
  const answered =
    report.kind === "DATO_INCORRECTO"
      ? [
          row("¿Dónde?", report.donde ?? ""),
          row("La app dice", report.appDice ?? ""),
          row("Debería decir", report.appDeberiaDecir ?? ""),
        ]
      : [row("Qué hace falta", report.queFalta ?? "")];

  const screenshotLine = report.hasScreenshot
    ? "Se capturó una foto de la pantalla. Ábrela en el enlace de arriba (no se adjunta: contiene datos de planilla)."
    : `No hay foto de la pantalla${report.screenshotError ? ` (${report.screenshotError})` : ""}.`;

  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111827;">
  <h2 style="margin:0 0 4px;font-size:16px;">${esc(KIND_LABEL[report.kind])}</h2>
  <p style="margin:0 0 16px;color:#6b7280;">Reportado por ${esc(report.autor)} (${esc(report.role)})</p>

  <p style="margin:0 0 20px;">
    <a href="${esc(reportLink)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Ver el reporte completo</a>
  </p>

  <table style="border-collapse:collapse;">
    ${answered.join("\n    ")}
    ${row("Página", report.url)}
    ${row("Correo", report.email)}
    ${row("Fecha", `${report.createdAt.toISOString()}${report.meta.tz ? ` (${report.meta.tz})` : ""}`)}
    ${row("Pantalla", `${report.meta.viewport || "?"} · monitor ${report.meta.screen || "?"} · DPR ${report.meta.dpr}`)}
    ${row("Navegador", report.meta.userAgent || "?")}
  </table>

  <p style="margin:16px 0 0;color:#6b7280;">${esc(screenshotLine)}</p>
</div>`;
}

/**
 * Best-effort notification. Returns the outcome so the caller can record it on
 * the report row; NOT_CONFIGURED is a valid state, not an error — reports are
 * meant to be useful before the mail domain is verified.
 */
export async function sendBugReportEmail(
  report: BugReportEmailInput,
): Promise<BugReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BUG_REPORT_FROM;
  const to = recipients();

  if (!apiKey || !from || to.length === 0) {
    const missing = [
      !apiKey && "RESEND_API_KEY",
      !from && "BUG_REPORT_FROM",
      to.length === 0 && "BUG_REPORT_TO",
    ]
      .filter(Boolean)
      .join(", ");
    return {
      status: "NOT_CONFIGURED",
      resendId: null,
      error: `Sin configurar: ${missing}`,
    };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const reportLink = `${appUrl}/admin/reportes?id=${report.id}`;

  const subject = `[Finca] ${KIND_LABEL[report.kind]} — ${pathnameOf(report.url)} — ${report.autor}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: report.email,
      subject,
      html: buildHtml(report, reportLink),
    });

    if (error) {
      return { status: "FAILED", resendId: null, error: error.message };
    }

    return { status: "SENT", resendId: data?.id ?? null, error: null };
  } catch (error) {
    return {
      status: "FAILED",
      resendId: null,
      error: error instanceof Error ? error.message : "Error desconocido al enviar el correo",
    };
  }
}
