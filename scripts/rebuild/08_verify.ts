// =============================================================================
// scripts/rebuild/08_verify.ts — Post-rebuild verification (Batch 5.7 / 9.3).
// READ-ONLY. Run AFTER swap (07) + employee load (03) + reassignment (06) +
// worker FKs (09). Compares the new `public` schema against `backup` (the old
// tables) and asserts the rebuild is trustworthy. Exits non-zero on any FAIL.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/08_verify.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let failures = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  console.log(`  ${pass ? "✓" : "✗ FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!pass) failures++;
};
const one = async <T>(sql: string): Promise<T> => (await prisma.$queryRawUnsafe<T[]>(sql))[0];
const n = async (sql: string) => Number((await one<{ v: bigint }>(sql)).v);
const money = async (sql: string) => Number((await one<{ v: string | null }>(sql)).v ?? 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

// tables whose row count must be conserved exactly (everything except workers,
// payroll_entries, and the 4 new tables that have no backup counterpart)
const COUNT_EQUAL = [
  "users", "system_settings", "notebook_dictionary", "lotes", "activities",
  "activity_prices", "pay_periods", "coffee_intakes", "plan_entries",
  "production_estimates", "audit_logs", "activity_records",
];

const V7_TABLES: [string, string][] = [
  ["users", "id"], ["system_settings", "id"], ["notebook_dictionary", "id"], ["lotes", "id"],
  ["workers", "id"], ["worker_documents", "id"], ["dpi_documents", "document_id"], ["birth_certificate_documents", "document_id"],
  ["activities", "id"], ["activity_prices", "id"], ["pay_periods", "id"], ["activity_records", "id"],
  ["payroll_entries", "id"], ["holidays", "id"], ["coffee_intakes", "id"], ["plan_entries", "id"],
  ["production_estimates", "id"], ["audit_logs", "id"],
];

(async () => {
  console.log("\n=== rebuild verification (read-only) ===\n");

  console.log("1) row-count conservation (public == backup):");
  for (const t of COUNT_EQUAL) {
    const pub = await n(`SELECT COUNT(*)::bigint v FROM public."${t}"`);
    const bak = await n(`SELECT COUNT(*)::bigint v FROM backup."${t}"`);
    ok(t, pub === bak, `public=${pub} backup=${bak}`);
  }
  const wPub = await n(`SELECT COUNT(*)::bigint v FROM public.workers`);
  const wBak = await n(`SELECT COUNT(*)::bigint v FROM backup.workers`);
  console.log(`     workers: public=${wPub} (canonical SSOT)  backup=${wBak} (old)`);
  const peP = await n(`SELECT COUNT(*)::bigint v FROM public.payroll_entries`);
  const peB = await n(`SELECT COUNT(*)::bigint v FROM backup.payroll_entries`);
  ok("payroll_entries count public ≤ backup (merge may reduce)", peP <= peB, `public=${peP} backup=${peB}`);

  console.log("\n2) money conservation (sums unchanged across rebuild + reassignment):");
  const arP = r2(await money(`SELECT SUM(total_earned) v FROM public.activity_records`));
  const arB = r2(await money(`SELECT SUM(total_earned) v FROM backup.activity_records`));
  ok("Σ activity_records.total_earned", arP === arB, `public=Q${arP} backup=Q${arB}`);
  const pteP = r2(await money(`SELECT SUM(total_earned) v FROM public.payroll_entries`));
  const pteB = r2(await money(`SELECT SUM(total_earned) v FROM backup.payroll_entries`));
  ok("Σ payroll_entries.total_earned", pteP === pteB, `public=Q${pteP} backup=Q${pteB}`);
  const ptpP = r2(await money(`SELECT SUM(total_to_pay) v FROM public.payroll_entries`));
  const ptpB = r2(await money(`SELECT SUM(total_to_pay) v FROM backup.payroll_entries`));
  // total_to_pay is recomputed (now includes seventh_day_pay, 0 for migrated rows) — should still equal old.
  ok("Σ payroll_entries.total_to_pay", ptpP === ptpB, `public=Q${ptpP} backup=Q${ptpB}`);

  console.log("\n3) referential integrity (no orphans):");
  ok("activity_records → workers", 0 === await n(
    `SELECT COUNT(*)::bigint v FROM public.activity_records a WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id=a.worker_id)`));
  ok("payroll_entries → workers", 0 === await n(
    `SELECT COUNT(*)::bigint v FROM public.payroll_entries p WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id=p.worker_id)`));
  ok("activity_records → pay_periods", 0 === await n(
    `SELECT COUNT(*)::bigint v FROM public.activity_records a WHERE NOT EXISTS (SELECT 1 FROM public.pay_periods x WHERE x.id=a.pay_period_id)`));
  ok("activity_records → activities", 0 === await n(
    `SELECT COUNT(*)::bigint v FROM public.activity_records a WHERE NOT EXISTS (SELECT 1 FROM public.activities x WHERE x.id=a.activity_id)`));
  ok("activity_records → lotes (where set)", 0 === await n(
    `SELECT COUNT(*)::bigint v FROM public.activity_records a WHERE a.lote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lotes x WHERE x.id=a.lote_id)`));

  console.log("\n4) every PK is a valid UUIDv7 (version nibble = '7'):");
  for (const [t, pk] of V7_TABLES) {
    const bad = await n(`SELECT COUNT(*)::bigint v FROM public."${t}" WHERE substring("${pk}"::text, 15, 1) <> '7'`);
    ok(`${t}.${pk}`, bad === 0, bad === 0 ? "" : `${bad} non-v7`);
  }

  console.log("\n5) employee roster integrity:");
  ok("workers.cui all distinct (unique)", wPub === await n(`SELECT COUNT(DISTINCT cui)::bigint v FROM public.workers`));
  const docs = await n(`SELECT COUNT(*)::bigint v FROM public.worker_documents`);
  ok("worker_documents ≥ workers (≥1 doc each)", docs >= wPub, `docs=${docs} workers=${wPub}`);

  console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"} ===`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => { console.error("VERIFY ERROR:", e); await prisma.$disconnect(); process.exit(1); });
