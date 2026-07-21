// =============================================================================
// scripts/reclassify-anticipos.ts — Move ANTICIPOS out of .deductions into
// .advances on PayrollEntry.
//
// WHY: until 2026-07 there was no write path for payroll_entries.advances, so
// anticipos were recorded as DESCUENTOS with the note "Anticipo". calcNetPay
// subtracts both terms identically, so NET PAY WAS AND STAYS CORRECT — this is
// purely a reclassification so the Anticipos columns stop reading zero.
//
// SAFETY (all enforced; any failure aborts the WHOLE transaction):
//   • only rows whose deductionsNote is EXACTLY "Anticipo" (case-insensitive,
//     trimmed) are touched. Anything merely CONTAINING "anticipo" is reported
//     and skipped — a pooled note cannot be split safely by a machine.
//   • ABORT if the row already has advances != 0 (never silently merge)
//   • ABORT unless the recomputed totalToPay EQUALS the stored one to the cent.
//     This is the invariant that proves no payment changed.
//   • every row gets an AuditLog entry under a REAL user (--actor), because
//     these rows are closed-period payroll.
//
// PREREQUISITE: migration 20260721000000_payroll_advance_note must be applied
// (this script writes advances_note).
//
// Dry-run by default, --commit persists:
//   npx dotenv -e .env.local -- npx tsx scripts/reclassify-anticipos.ts
//   npx dotenv -e .env.local -- npx tsx scripts/reclassify-anticipos.ts --commit --actor=<userId>
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { calcNetPay } from "../src/lib/utils/calculations";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const ACTOR = argv.find((a) => a.startsWith("--actor="))?.slice("--actor=".length) ?? "";

const r2 = (x: number) => Math.round(x * 100) / 100;
const isExactAnticipo = (n: string | null) => !!n && n.trim().toLowerCase() === "anticipo";
const mentionsAnticipo = (n: string | null) => !!n && /anticipo/i.test(n);

(async () => {
  if (COMMIT && !ACTOR) {
    throw new Error("--commit requiere --actor=<userId> (estas filas son de planilla cerrada y deben auditarse).");
  }
  if (COMMIT) {
    const actor = await prisma.user.findUnique({ where: { id: ACTOR }, select: { id: true, name: true, role: true } });
    if (!actor) throw new Error(`--actor=${ACTOR} no existe.`);
    console.log(`Actor de auditoría: ${actor.name} (${actor.role})`);
  }

  const rows = await prisma.payrollEntry.findMany({
    where: { deductions: { gt: 0 } },
    select: {
      id: true,
      totalEarned: true, seventhDayPay: true, bonification: true,
      advances: true, deductions: true, deductionsNote: true, totalToPay: true,
      worker: { select: { fullName: true } },
      payPeriod: { select: { periodNumber: true, agriculturalYear: true, isClosed: true } },
    },
  });

  const targets = rows.filter((r) => isExactAnticipo(r.deductionsNote));
  const ambiguous = rows.filter((r) => mentionsAnticipo(r.deductionsNote) && !isExactAnticipo(r.deductionsNote));

  if (ambiguous.length > 0) {
    console.log(`\n⚠️  ${ambiguous.length} fila(s) mencionan "anticipo" sin serlo exactamente — NO se tocan, revisar a mano:`);
    for (const r of ambiguous) console.log(`   ${r.worker.fullName}  Q${Number(r.deductions).toFixed(2)}  "${r.deductionsNote}"`);
  }

  if (targets.length === 0) {
    console.log("\nNo hay anticipos que reclasificar.");
    await prisma.$disconnect();
    return;
  }

  // Validate every row BEFORE writing anything.
  type Plan = { id: string; name: string; period: string; amount: number; totalToPay: number; note: string };
  const plan: Plan[] = [];
  for (const r of targets) {
    const amount = r2(Number(r.deductions));
    if (Number(r.advances) !== 0) {
      throw new Error(`ABORT: ${r.worker.fullName} ya tiene advances=${Number(r.advances)} (colisión).`);
    }
    const stored = r2(Number(r.totalToPay));
    const recomputed = calcNetPay(
      Number(r.totalEarned), Number(r.bonification), Number(r.seventhDayPay),
      amount, // advances (was deductions)
      0,      // deductions (now cleared)
    );
    if (r2(recomputed) !== stored) {
      throw new Error(
        `ABORT: ${r.worker.fullName} — totalToPay cambiaría ${stored} → ${r2(recomputed)}. La reclasificación debe ser neutral.`,
      );
    }
    plan.push({
      id: r.id,
      name: r.worker.fullName,
      period: `${r.payPeriod.agriculturalYear}#${r.payPeriod.periodNumber}${r.payPeriod.isClosed ? " (cerrado)" : ""}`,
      amount,
      totalToPay: stored,
      note: r.deductionsNote!,
    });
  }

  const total = r2(plan.reduce((s, p) => s + p.amount, 0));
  console.log(`\n${COMMIT ? "APLICANDO" : "DRY-RUN"} — ${plan.length} fila(s), Q${total.toFixed(2)} a reclasificar:`);
  console.log("  Trabajador                          Período      Descuento→Anticipo   A pagar (sin cambio)");
  for (const p of plan) {
    console.log(`  ${p.name.padEnd(34)}  ${p.period.padEnd(11)}  Q${p.amount.toFixed(2).padStart(10)}         Q${p.totalToPay.toFixed(2)}`);
  }

  if (!COMMIT) {
    console.log("\nDRY-RUN — no se escribió nada. Repetir con --commit --actor=<userId>.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx.payrollEntry.update({
        where: { id: p.id },
        data: { advances: p.amount, advancesNote: p.note, deductions: 0, deductionsNote: null },
      });
      await tx.auditLog.create({
        data: {
          userId: ACTOR,
          action: "UPDATE",
          tableName: "payroll_entries",
          recordId: p.id,
          oldValues: { deductions: p.amount, deductionsNote: p.note, advances: 0, advancesNote: null },
          newValues: { deductions: 0, deductionsNote: null, advances: p.amount, advancesNote: p.note },
        },
      });
    }
  }, { timeout: 120_000 });

  console.log(`\n✅ ${plan.length} fila(s) reclasificadas. totalToPay sin cambios (Q${total.toFixed(2)} movidos de descuentos a anticipos).`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERROR:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
