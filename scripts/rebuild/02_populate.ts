// =============================================================================
// scripts/rebuild/02_populate.ts — Populate the `rebuild` schema's NON-EMPLOYEE
// tables from the current `public` tables (pre-swap), remapping every UUIDv4 id
// to a UUIDv7 whose timestamp = the row's created_at.
//
//   • Every table's PK is remapped old→new via a per-table id map.
//   • Hard FKs and single-target soft-refs are remapped via those maps.
//   • Polymorphic soft-refs (notebook_dictionary.reference_id by `category`,
//     audit_logs.record_id by `table_name`) are remapped per target table.
//   • WORKER-referencing columns are LEFT AS THE OLD v4 VALUE (transient) —
//     real workers come from SSOT and are reassigned in Batch 9. There is no
//     workers id map here, so any column pointing at workers isn't remapped.
//   • Employees (workers + document tables) are NOT touched here → 03_*.
//
// Requires: the `rebuild` schema + new tables already created (script 01,
// executed WITHOUT the two worker FKs — those are added in Batch 9).
//
// Dry-run by default: runs everything in ONE interactive transaction and ROLLS
// BACK, printing per-table counts. Pass --commit to persist.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/02_populate.ts [--commit]
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { uuidv7FromDate } from "./lib/uuidv7";

// Sentinel that forces a rollback at the end of a successful dry-run.
class RollbackSignal extends Error {
  constructor() {
    super("dry-run rollback");
    this.name = "RollbackSignal";
  }
}

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

type Tx = Prisma.TransactionClient;

type TableCfg = {
  name: string;
  fks?: Record<string, string>;       // column -> referenced table (hard FK)
  softRefs?: Record<string, string>;  // column -> referenced table (no FK constraint)
  polymorphic?: "notebook_dictionary" | "audit_logs";
};

// FK-dependency order (parents before children). `workers` + document tables
// excluded (SSOT-populated). worker_id columns are deliberately NOT listed as
// fks → kept transient (old v4).
const TABLES: TableCfg[] = [
  { name: "users" },
  { name: "lotes" },
  { name: "activities" },
  { name: "system_settings", softRefs: { updated_by: "users" } },
  { name: "pay_periods", softRefs: { closed_by: "users" } },
  { name: "activity_prices", fks: { activity_id: "activities" }, softRefs: { created_by: "users" } },
  { name: "notebook_dictionary", polymorphic: "notebook_dictionary" },
  { name: "coffee_intakes", fks: { lote_id: "lotes" } },
  { name: "plan_entries", fks: { lote_id: "lotes", activity_id: "activities" } },
  { name: "production_estimates", fks: { lote_id: "lotes" } },
  { name: "activity_records", fks: { pay_period_id: "pay_periods", activity_id: "activities", lote_id: "lotes" } },
  { name: "payroll_entries", fks: { pay_period_id: "pay_periods" } },
  { name: "audit_logs", fks: { user_id: "users" }, polymorphic: "audit_logs" },
];

const ID_TABLES = TABLES.map((t) => t.name);
const q = (id: string) => `"${id}"`;

const exec = (tx: Tx, sql: string) => tx.$executeRawUnsafe(sql);
const query = <T = Record<string, unknown>>(tx: Tx, sql: string) => tx.$queryRawUnsafe<T[]>(sql);

async function buildIdMaps(tx: Tx): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of ID_TABLES) {
    const rows = await query<{ id: string; created_at: Date }>(tx, `SELECT id, created_at FROM public.${q(t)}`);
    await exec(tx, `DROP TABLE IF EXISTS rebuild.${q("idmap_" + t)}`);
    await exec(tx, `CREATE TABLE rebuild.${q("idmap_" + t)} (old_id uuid PRIMARY KEY, new_id uuid NOT NULL)`);
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const values = rows
        .slice(i, i + BATCH)
        .map((r) => `('${r.id}'::uuid,'${uuidv7FromDate(new Date(r.created_at))}'::uuid)`)
        .join(",");
      if (values) await exec(tx, `INSERT INTO rebuild.${q("idmap_" + t)} (old_id,new_id) VALUES ${values}`);
    }
    counts[t] = rows.length;
  }
  return counts;
}

async function columnsOf(tx: Tx, table: string): Promise<string[]> {
  const rows = await query<{ column_name: string }>(
    tx,
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`,
  );
  return rows.map((r) => r.column_name);
}

async function copyTable(tx: Tx, cfg: TableCfg): Promise<number> {
  const cols = await columnsOf(tx, cfg.name);
  const joins: string[] = [`JOIN rebuild.${q("idmap_" + cfg.name)} m0 ON m0.old_id = t.id`];
  const fks = cfg.fks ?? {};
  const softRefs = cfg.softRefs ?? {};

  const exprs = cols.map((c) => {
    if (c === "id") return "m0.new_id";
    if (fks[c]) {
      const a = `fk_${c}`;
      joins.push(`LEFT JOIN rebuild.${q("idmap_" + fks[c])} ${a} ON ${a}.old_id = t.${q(c)}`);
      return `COALESCE(${a}.new_id, t.${q(c)})`;
    }
    if (softRefs[c]) {
      const a = `sr_${c}`;
      joins.push(`LEFT JOIN rebuild.${q("idmap_" + softRefs[c])} ${a} ON ${a}.old_id = t.${q(c)}`);
      return `COALESCE(${a}.new_id, t.${q(c)})`;
    }
    if (cfg.polymorphic === "notebook_dictionary" && c === "reference_id") {
      joins.push(`LEFT JOIN rebuild.${q("idmap_activities")} nd_act ON nd_act.old_id = t.reference_id`);
      joins.push(`LEFT JOIN rebuild.${q("idmap_lotes")} nd_lote ON nd_lote.old_id = t.reference_id`);
      return `CASE t.category
        WHEN 'activity' THEN COALESCE(nd_act.new_id, t.reference_id)
        WHEN 'lote' THEN COALESCE(nd_lote.new_id, t.reference_id)
        ELSE t.reference_id END`; // 'worker' transient, 'abbreviation' null
    }
    if (cfg.polymorphic === "audit_logs" && c === "record_id") {
      const guarded = `CASE WHEN t.record_id ~ '^[0-9a-fA-F-]{36}$' THEN t.record_id::uuid END`;
      const branches: string[] = [];
      for (const target of ID_TABLES) {
        if (target === "audit_logs") continue;
        const a = `al_${target}`;
        joins.push(`LEFT JOIN rebuild.${q("idmap_" + target)} ${a} ON ${a}.old_id = (${guarded})`);
        branches.push(`WHEN '${target}' THEN COALESCE(${a}.new_id::text, t.record_id)`);
      }
      return `CASE t.table_name ${branches.join(" ")} ELSE t.record_id END`; // workers transient
    }
    return `t.${q(c)}`;
  });

  const sql = `INSERT INTO rebuild.${q(cfg.name)} (${cols.map(q).join(", ")})
    SELECT ${exprs.join(", ")} FROM public.${q(cfg.name)} t ${joins.join(" ")}`;
  await exec(tx, sql);
  const [{ n }] = await query<{ n: bigint }>(tx, `SELECT COUNT(*)::bigint AS n FROM rebuild.${q(cfg.name)}`);
  return Number(n);
}

(async () => {
  console.log(`\n=== rebuild populate (non-employee) — ${COMMIT ? "COMMIT" : "DRY-RUN (rollback)"} ===\n`);
  try {
    await prisma.$transaction(
      async (tx) => {
        const mapCounts = await buildIdMaps(tx);
        console.log("id maps built:", mapCounts);

        const copied: Record<string, number> = {};
        for (const cfg of TABLES) copied[cfg.name] = await copyTable(tx, cfg);
        console.log("\nrows copied into rebuild.*:", copied);

        for (const t of ID_TABLES) {
          const [{ n }] = await query<{ n: bigint }>(tx, `SELECT COUNT(*)::bigint AS n FROM public.${q(t)}`);
          if (Number(n) !== copied[t]) throw new Error(`CONSERVATION FAIL ${t}: public=${n} rebuild=${copied[t]}`);
        }
        console.log("\n✓ row-count conservation OK for all tables");

        // idmaps are transient to this populate
        for (const t of ID_TABLES) await exec(tx, `DROP TABLE IF EXISTS rebuild.${q("idmap_" + t)}`);

        if (!COMMIT) throw new RollbackSignal();
      },
      { timeout: 600_000 },
    );
  } catch (e) {
    if (e instanceof RollbackSignal) {
      console.log("\nDRY-RUN complete — rolled back. Re-run with --commit to persist.");
    } else {
      console.error("\nPOPULATE FAILED:", e);
      await prisma.$disconnect();
      process.exit(1);
    }
  }
  await prisma.$disconnect();
})();
