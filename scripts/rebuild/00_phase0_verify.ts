// =============================================================================
// scripts/rebuild/00_phase0_verify.ts — Batch 5.1 Phase-0 verify (READ-ONLY).
// Surfaces server version + anything on the public schema (RLS policies, views,
// triggers, sequences) that the schema swap (07) must account for.
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/00_phase0_verify.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const q = (s: string) => p.$queryRawUnsafe<Record<string, unknown>[]>(s);

(async () => {
  const ver = await q("SHOW server_version");
  const pol = await q("SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'");
  const views = await q("SELECT table_name FROM information_schema.views WHERE table_schema='public'");
  const trig = await q(
    "SELECT event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name NOT LIKE 'RI_%'",
  );
  const seq = await q("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'");
  const tbls = await q(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  );

  console.log("server_version :", (ver[0] as { server_version: string }).server_version);
  console.log("RLS policies   :", pol.length, pol.map((r) => `${r.tablename}.${r.policyname}`).join(", ") || "(none)");
  console.log("views          :", views.length, views.map((r) => r.table_name).join(", ") || "(none)");
  console.log("triggers(nonFK):", trig.length, trig.map((r) => `${r.event_object_table}:${r.trigger_name}`).join(", ") || "(none)");
  console.log("sequences      :", seq.length, seq.map((r) => r.sequence_name).join(", ") || "(none)");
  console.log("base tables    :", tbls.length, "—", tbls.map((r) => r.table_name).join(", "));
})()
  .catch((e) => { console.error("PHASE-0 ERROR:", e.message); process.exit(1); })
  .finally(() => p.$disconnect());
