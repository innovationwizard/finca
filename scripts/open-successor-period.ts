// =============================================================================
// scripts/open-successor-period.ts — Open the successor of the currently open
// pay period WITHOUT closing it. Same row the app would create on its own:
// the range comes from close/route.ts `nextRange()` (start = prevEnd + 1 day;
// end = 4th Saturday on/after start), the number/year/type from the same rules
// as POST /api/pay-periods. Nothing about the current period is touched.
//
// Why this exists: the successor is normally created as a side-effect of
// CLOSING the previous period, but closing is gated on payment authorization.
// Days after the previous period's endDate are then uncovered, and the Captura
// grid refuses to save the WHOLE displayed week when any day in it is uncovered
// — blocking days that are themselves perfectly valid. Creating the successor
// ahead of the close clears that block without altering the period awaiting
// payment. When the previous period is later closed, its auto-create finds this
// row overlapping and skips (close/route.ts) — so there is no duplicate.
//
// --as=<email> is REQUIRED and must resolve to an active MASTER/ADMIN — the same
// authorization POST /api/pay-periods enforces (SETTINGS_ROLES), and the actor
// the audit entry is attributed to. There is no unattributed path.
//
// Dry-run by default (transaction + rollback, prints the row). --commit persists.
//   npx dotenv -e .env.local -- npx tsx scripts/open-successor-period.ts --as=<email> [--commit]
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { getAgriculturalYear } from "../src/lib/utils/agricultural-year";

class RollbackSignal extends Error {}
const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const AS = process.argv.find((a) => a.startsWith("--as="))?.slice(5).trim();
const SETTINGS_ROLES = ["MASTER", "ADMIN"] as const;
const isoUTC = (d: Date) => d.toISOString().split("T")[0];

// Verbatim from src/app/api/pay-periods/[id]/close/route.ts — the successor
// range the app itself would produce, so this script cannot drift from it.
function nextRange(prevEnd: Date): { start: Date; end: Date } {
  const start = new Date(prevEnd);
  start.setUTCDate(start.getUTCDate() + 1); // hard: next calendar day, zero gap
  const toFirstSat = (6 - start.getUTCDay() + 7) % 7; // 0 if start is Saturday
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + toFirstSat + 21); // 1st Saturday + 3 weeks
  return { start, end };
}

(async () => {
  console.log(`\n=== open successor period — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);

  // Same gate as the API (SETTINGS_ROLES), and the actor for the audit entry.
  if (!AS) throw new Error("ABORT: falta --as=<email> del MASTER/ADMIN que autoriza (se registra en la bitácora).");
  const actor = await prisma.user.findUnique({ where: { email: AS }, select: { id: true, name: true, role: true, isActive: true } });
  if (!actor) throw new Error(`ABORT: no existe usuario con email "${AS}".`);
  if (!actor.isActive) throw new Error(`ABORT: el usuario "${AS}" está inactivo.`);
  if (!SETTINGS_ROLES.includes(actor.role as (typeof SETTINGS_ROLES)[number])) {
    throw new Error(`ABORT: el rol ${actor.role} no puede crear períodos. Requiere ${SETTINGS_ROLES.join(" o ")}.`);
  }
  console.log(`autorizado por: ${actor.name} (${actor.role})\n`);

  const open = await prisma.payPeriod.findMany({
    where: { isClosed: false },
    select: { id: true, periodNumber: true, startDate: true, endDate: true, agriculturalYear: true },
    orderBy: { startDate: "asc" },
  });
  if (open.length === 0) throw new Error("ABORT: no hay período abierto — nada de qué derivar el sucesor.");
  if (open.length > 1) {
    throw new Error(
      `ABORT: hay ${open.length} períodos abiertos (${open.map((p) => `#${p.periodNumber}`).join(", ")}). ` +
        "El sucesor ya existe o el estado es inesperado — revise antes de crear otro.",
    );
  }

  const prev = open[0];
  const { start, end } = nextRange(prev.endDate);
  console.log(`período abierto actual:  #${prev.periodNumber}  ${isoUTC(prev.startDate)} → ${isoUTC(prev.endDate)}  (agYear ${prev.agriculturalYear})`);
  console.log(`sucesor a crear:         ${isoUTC(start)} → ${isoUTC(end)}`);

  // Same integrity check as POST /api/pay-periods: two ranges overlap iff each
  // starts on or before the other ends.
  const conflict = await prisma.payPeriod.findFirst({
    where: { startDate: { lte: end }, endDate: { gte: start } },
    select: { periodNumber: true, startDate: true, endDate: true },
  });
  if (conflict) {
    throw new Error(
      `ABORT: el rango se traslapa con el período ${conflict.periodNumber} ` +
        `(${isoUTC(conflict.startDate)}…${isoUTC(conflict.endDate)}). El sucesor probablemente ya existe.`,
    );
  }

  // Year from the successor's START date (not "today") — same as the API.
  const year = getAgriculturalYear(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const maxPeriod = await prisma.payPeriod.aggregate({ where: { agriculturalYear: year }, _max: { periodNumber: true } });
  const periodNumber = (maxPeriod._max.periodNumber ?? 0) + 1;

  const typeSetting = await prisma.systemSetting.findUnique({ where: { key: "pay_period_type" } });
  const type = typeSetting ? JSON.parse(typeSetting.value) : "SEMANAL";

  console.log(`                         #${periodNumber}, agYear ${year}, type ${type}, isClosed false\n`);

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.payPeriod.create({
        data: { type, periodNumber, agriculturalYear: year, startDate: start, endDate: end },
        select: { id: true, periodNumber: true, startDate: true, endDate: true, agriculturalYear: true, type: true, isClosed: true },
      });
      // Audited like every other pay-period mutation, attributed to the actor.
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "CREATE_PAY_PERIOD",
          tableName: "pay_periods",
          recordId: created.id,
          newValues: {
            startDate: isoUTC(created.startDate),
            endDate: isoUTC(created.endDate),
            openedAheadOfCloseOf: prev.id,
            via: "scripts/open-successor-period.ts",
          },
        },
      });
      console.log(`CREATE  #${created.periodNumber}  ${isoUTC(created.startDate)} → ${isoUTC(created.endDate)}  agYear=${created.agriculturalYear}  type=${created.type}`);

      const openAfter = await tx.payPeriod.findMany({ where: { isClosed: false }, select: { periodNumber: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } });
      console.log(`\nperíodos abiertos tras el cambio: ${openAfter.map((p) => `#${p.periodNumber} ${isoUTC(p.startDate)}→${isoUTC(p.endDate)}`).join(", ")}`);
      console.log("(el anterior sigue abierto y sin tocar hasta que se autorice el pago)");

      if (!COMMIT) throw new RollbackSignal();
    });
  } catch (e) {
    if (e instanceof RollbackSignal) { console.log("\nDRY-RUN completo — revertido. Re-ejecute con --commit para persistir."); }
    else { console.error("\nFALLÓ (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); }
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FALLÓ (sin cambios):", e instanceof Error ? e.message : e); await prisma.$disconnect(); process.exit(1); });
