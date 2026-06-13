// =============================================================================
// scripts/rebuild/10_unmapped_review.ts — READ-ONLY. Dump the still-UNMAPPED
// old worker rows (the hallucinated identities) so Jorge can eyeball them one
// last time before deciding their disposition (quarantine vs remove-from-live).
// Sorted by record load desc. Writes a gitignored HTML to backups/.
//
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/10_unmapped_review.ts
// =============================================================================

import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Row = { old_worker_id: string; old_full_name: string; old_dpi: string | null; activity_count: number; payroll_count: number; payroll_total: string };

(async () => {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT old_worker_id, old_full_name, old_dpi, activity_count, payroll_count, payroll_total
     FROM public.worker_reassignment
     WHERE new_worker_id IS NULL
     ORDER BY (activity_count + payroll_count) DESC, old_full_name`,
  );

  const withRec = rows.filter((r) => r.activity_count + r.payroll_count > 0);
  const noRec = rows.filter((r) => r.activity_count + r.payroll_count === 0);
  const totAct = withRec.reduce((s, r) => s + r.activity_count, 0);
  const totPay = withRec.reduce((s, r) => s + r.payroll_count, 0);
  const totMoney = withRec.reduce((s, r) => s + Number(r.payroll_total), 0);

  const tr = (r: Row) => `<tr${r.activity_count + r.payroll_count === 0 ? ' class="norec"' : ""}>
      <td><b>${esc(r.old_full_name)}</b></td>
      <td class="meta">${esc(r.old_dpi ?? "—")}</td>
      <td class="num">${r.activity_count}</td>
      <td class="num">${r.payroll_count}</td>
      <td class="num">Q${esc(r.payroll_total)}</td>
    </tr>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Revisión de registros sin asignar — Finca Danilandia</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;background:#fff8f6;color:#1c2620}
.wrap{max-width:820px;margin:0 auto;padding:18px}
h1{font-size:20px}.sub{color:#5b6b60;font-size:14px}
.summary{background:#fff;border:1px solid #f0c9c0;border-radius:10px;padding:12px 14px;margin:10px 0;font-size:14px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5b9b0;border-radius:10px;overflow:hidden;margin-top:10px}
th,td{padding:7px 10px;border-bottom:1px solid #f3e4e0;text-align:left;font-size:14px}
th{background:#fdeeea;color:#9a3412;font-size:12px;text-transform:uppercase}
.meta{color:#5b6b60;font-size:12px}.num{white-space:nowrap;text-align:right;color:#374151;font-size:13px}
tr.norec{opacity:.5}
</style></head><body><div class="wrap">
<h1>Registros sin asignar — revisión final</h1>
<p class="sub">Estos nombres no fueron reconocidos por nadie en la operación. Antes de decidir qué hacer con sus registros, revíselos una última vez por si alguno le resulta familiar.</p>
<div class="summary">
  <b>${withRec.length}</b> registros antiguos con historial · <b>${totAct}</b> trabajos · <b>${totPay}</b> pagos · <b>Q${totMoney.toFixed(2)}</b> en total.<br>
  <span class="meta">Además ${noRec.length} sin ningún registro (atenuados al final).</span>
</div>
<table><thead><tr><th>Nombre antiguo (registrado)</th><th>DPI/CUI antiguo</th><th>Trabajos</th><th>Pagos</th><th>Monto</th></tr></thead>
<tbody>${withRec.map(tr).join("")}${noRec.map(tr).join("")}</tbody></table>
</div></body></html>`;

  const out = "backups/unmapped-review.html";
  writeFileSync(out, html);
  console.log(`✓ ${out} written — ${withRec.length} with records (${totAct} act / ${totPay} pay / Q${totMoney.toFixed(2)}), ${noRec.length} without.`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FAILED:", e); await prisma.$disconnect(); process.exit(1); });
