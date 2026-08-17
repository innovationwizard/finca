// =============================================================================
// src/app/(authenticated)/admin/reportes/page.tsx — Reports filed with "Reportar".
//
// Read-only, MASTER + ADMIN. This is where the notification email's link lands
// (?id=<report>) — the mail carries no screenshot, so this authenticated page is
// the only place the image is ever shown, behind a short-lived signed URL.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { requireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { signedScreenshotUrl } from "@/lib/feedback/screenshot-storage";
import { parseBugReportMeta } from "@/lib/validators/bug-report";
import { ReportesList } from "./reportes-list";

export const metadata = { title: "Reportes de usuarios" };

/** Never cache: the signed screenshot URLs expire, and reports arrive continuously. */
export const dynamic = "force-dynamic";

/** One page of reports. Older ones stay reachable by id through the email link. */
const PAGE_SIZE = 100;

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireRole(...SETTINGS_ROLES);

  const { id: highlightId } = await searchParams;

  const reports = await prisma.bugReport.findMany({
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  // The linked report may be older than the page window — fetch it explicitly so
  // the email link always lands on something.
  if (highlightId && !reports.some((r) => r.id === highlightId)) {
    const linked = await prisma.bugReport.findUnique({ where: { id: highlightId } });
    if (linked) reports.unshift(linked);
  }

  const serialized = await Promise.all(
    reports.map(async (r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      autor: r.autor,
      email: r.email,
      role: r.role,
      kind: r.kind,
      donde: r.donde,
      appDice: r.appDice,
      appDeberiaDecir: r.appDeberiaDecir,
      queFalta: r.queFalta,
      url: r.url,
      meta: parseBugReportMeta(r.meta),
      screenshotUrl: r.screenshotPath
        ? await signedScreenshotUrl(r.screenshotPath)
        : null,
      screenshotError: r.screenshotError,
      emailStatus: r.emailStatus,
      emailError: r.emailError,
    })),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-finca-900">
          Reportes de usuarios
        </h1>
        <p className="mt-1 text-sm text-finca-500">
          Lo que los usuarios reportaron desde el botón «Reportar». Solo lectura.
        </p>
      </div>
      <ReportesList reports={serialized} highlightId={highlightId ?? null} />
    </div>
  );
}
