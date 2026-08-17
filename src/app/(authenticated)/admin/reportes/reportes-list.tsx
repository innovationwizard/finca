"use client";

// =============================================================================
// src/app/(authenticated)/admin/reportes/reportes-list.tsx — Read-only report list.
//
// No status, no reply, no assignment: this is the record of what was reported,
// not an issue tracker. The screenshot is shown behind a signed URL minted on
// the server for this request only.
// =============================================================================

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, HelpCircle, Mail, MailX, ImageOff } from "lucide-react";
import type { BugReportMeta } from "@/lib/validators/bug-report";

type Report = {
  id: string;
  createdAt: string;
  autor: string;
  email: string;
  role: string;
  kind: "DATO_INCORRECTO" | "FALTA_ALGO";
  donde: string | null;
  appDice: string | null;
  appDeberiaDecir: string | null;
  queFalta: string | null;
  url: string;
  meta: BugReportMeta;
  screenshotUrl: string | null;
  screenshotError: string | null;
  emailStatus: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  emailError: string | null;
};

const KIND_LABEL: Record<Report["kind"], string> = {
  DATO_INCORRECTO: "Dato incorrecto",
  FALTA_ALGO: "Falta algo",
};

const EMAIL_LABEL: Record<Report["emailStatus"], string> = {
  PENDING: "Correo pendiente",
  SENT: "Correo enviado",
  FAILED: "Correo falló",
  NOT_CONFIGURED: "Correo sin configurar",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-finca-400">
        {label}
      </span>
      <span className="break-words text-sm text-finca-900">{value}</span>
    </div>
  );
}

export function ReportesList({
  reports,
  highlightId,
}: {
  reports: Report[];
  highlightId: string | null;
}) {
  const [openShot, setOpenShot] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-finca-200 px-4 py-10 text-center text-sm text-finca-500">
        Todavía no hay reportes.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {reports.map((report) => {
        const Icon = report.kind === "DATO_INCORRECTO" ? AlertTriangle : HelpCircle;
        const isHighlighted = report.id === highlightId;

        return (
          <li
            key={report.id}
            id={report.id}
            className={`rounded-xl border bg-white p-4 ${
              isHighlighted
                ? "border-finca-500 ring-2 ring-finca-200"
                : "border-finca-200"
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-finca-900">
                <Icon className="h-4 w-4 text-earth-500" />
                {KIND_LABEL[report.kind]}
              </span>
              <span className="text-sm text-finca-600">
                {report.autor} · {report.role}
              </span>
              <span className="text-xs text-finca-400">
                {formatDate(report.createdAt)}
              </span>
              <span
                title={report.emailError ?? undefined}
                className={`ml-auto flex items-center gap-1 text-xs ${
                  report.emailStatus === "SENT" ? "text-finca-600" : "text-earth-600"
                }`}
              >
                {report.emailStatus === "SENT" ? (
                  <Mail className="h-3.5 w-3.5" />
                ) : (
                  <MailX className="h-3.5 w-3.5" />
                )}
                {EMAIL_LABEL[report.emailStatus]}
              </span>
            </div>

            <div className="space-y-1.5">
              {report.kind === "DATO_INCORRECTO" ? (
                <>
                  <Row label="¿Dónde?" value={report.donde ?? ""} />
                  <Row label="La app dice" value={report.appDice ?? ""} />
                  <Row label="Debería decir" value={report.appDeberiaDecir ?? ""} />
                </>
              ) : (
                <Row label="Qué hace falta" value={report.queFalta ?? ""} />
              )}
              <Row label="Página" value={report.url} />
              <Row label="Correo" value={report.email} />
              <Row
                label="Entorno"
                value={`${report.meta.viewport || "?"} · monitor ${
                  report.meta.screen || "?"
                } · DPR ${report.meta.dpr}${report.meta.tz ? ` · ${report.meta.tz}` : ""}`}
              />
              <Row label="Navegador" value={report.meta.userAgent || "?"} />
            </div>

            <div className="mt-3">
              {report.screenshotUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenShot(openShot === report.id ? null : report.id)
                    }
                    className="text-sm font-medium text-finca-700 underline underline-offset-2 hover:text-finca-900"
                  >
                    {openShot === report.id ? "Ocultar la pantalla" : "Ver la pantalla"}
                  </button>
                  {openShot === report.id && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-finca-200">
                      <Image
                        src={report.screenshotUrl}
                        alt={`Pantalla reportada por ${report.autor}`}
                        width={1600}
                        height={900}
                        unoptimized
                        className="h-auto w-full"
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-finca-400">
                  <ImageOff className="h-3.5 w-3.5" />
                  Sin foto de la pantalla
                  {report.screenshotError ? ` — ${report.screenshotError}` : ""}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
