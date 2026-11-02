import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiRequireRole, HARVEST_DESK_ROLES } from "@/lib/auth/guards";
import { harvestLedger } from "@/lib/harvest/ledger";
import { categoryLabel } from "@/lib/workers/category-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await apiRequireRole(...HARVEST_DESK_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { rows } = await harvestLedger();
  const header = [
    "Fecha",
    "Trabajador",
    "CUI",
    "Categoría",
    "Cuadrilla",
    "Pante",
    "Libras",
    "Quintales",
    "Madurez",
    "Sacos",
    "Precio unitario",
    "Total",
    "Código ingreso",
  ];
  const aoa: (string | number)[][] = [
    header,
    ...rows.map((row) => [
      row.date,
      row.workerName,
      row.cui,
      categoryLabel(row.category),
      row.cuadrilla ?? "",
      row.pante,
      row.libras,
      row.quintales,
      row.madurez ?? "",
      row.sacos ?? "",
      row.unitPrice,
      row.totalEarned,
      row.intakeCode ?? "",
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Entregas");
  const buffer: Buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="cosecha-entregas.xlsx"',
    },
  });
}
