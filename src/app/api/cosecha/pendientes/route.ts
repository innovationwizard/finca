import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { splitCui } from "@/lib/harvest/cui";

export async function GET() {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.enrollmentCapture.findMany({
    where: { workerId: null },
    orderBy: { createdAt: "desc" },
    select: {
      clientId: true,
      chosenCategory: true,
      cuadrilla: true,
      documentType: true,
      nombres: true,
      apellidos: true,
      cui: true,
      cuiAsPrinted: true,
      fechaNacimiento: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      fechaNacimiento: row.fechaNacimiento?.toISOString().slice(0, 10) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  );
}

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: { clientId?: string; cui?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.clientId || !body.cui?.trim()) {
    return NextResponse.json({ error: "Faltan el enrolamiento y el CUI" }, { status: 400 });
  }
  const cui = splitCui(body.cui).cui;
  const worker = await prisma.worker.findUnique({ where: { cui }, select: { id: true } });
  if (!worker) {
    return NextResponse.json({ error: "No hay un trabajador con ese CUI" }, { status: 404 });
  }
  const capture = await prisma.enrollmentCapture.findUnique({
    where: { clientId: body.clientId },
    select: { id: true, workerId: true },
  });
  if (!capture) return NextResponse.json({ error: "Enrolamiento no encontrado" }, { status: 404 });
  if (capture.workerId) return NextResponse.json({ ok: true, workerId: capture.workerId });

  await prisma.enrollmentCapture.update({
    where: { id: capture.id },
    data: { workerId: worker.id },
  });
  return NextResponse.json({ ok: true, workerId: worker.id });
}
