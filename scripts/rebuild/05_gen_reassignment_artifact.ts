// =============================================================================
// scripts/rebuild/05_gen_reassignment_artifact.ts — Steward worksheet for the
// 216→38 worker reassignment (Batch 9, AFTER swap + after 04 setup).
//
// Two modes:
//   (generate, default)  Read-only. Reads public.worker_reassignment (old
//       workers + counts) and public.workers (the 38 canonical SSOT roster),
//       writes `reassignment-worksheet.html` — each old worker shown with its
//       name / old id / record load, and a DROPDOWN to SELECT its canonical
//       SSOT worker (selection only — honors the no-inline-CRUD rule). The page
//       emits a JSON map {old_worker_id: new_worker_id} for Jorge to save.
//   --ingest <file.json> [--commit]  Loads that JSON into
//       worker_reassignment.new_worker_id (validates ids; dry-run unless --commit).
//
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/05_gen_reassignment_artifact.ts
//   npx dotenv -e .env.local -- npx tsx scripts/rebuild/05_gen_reassignment_artifact.ts --ingest map.json [--commit]
// =============================================================================

import { writeFileSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const ingestIdx = argv.indexOf("--ingest");
const COMMIT = argv.includes("--commit");
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type OldRow = { old_worker_id: string; old_full_name: string; old_dpi: string | null; activity_count: number; payroll_count: number; payroll_total: string };
type Ssot = { id: string; cui: string; full_name: string };

async function generate() {
  const olds = await prisma.$queryRawUnsafe<OldRow[]>(
    `SELECT old_worker_id, old_full_name, old_dpi, activity_count, payroll_count, payroll_total
     FROM public.worker_reassignment ORDER BY (activity_count + payroll_count) DESC, old_full_name`,
  );
  const ssot = await prisma.$queryRawUnsafe<Ssot[]>(
    `SELECT id, cui, full_name FROM public.workers ORDER BY full_name`,
  );

  const options = ssot
    .map((w) => `<option value="${esc(w.id)}">${esc(w.full_name)} — ${esc(w.cui)}</option>`)
    .join("");

  const rows = olds
    .map((o) => `
      <tr${o.activity_count + o.payroll_count > 0 ? "" : ' class="norec"'}>
        <td><b>${esc(o.old_full_name)}</b><br><span class="meta">${esc(o.old_dpi ?? "—")}</span></td>
        <td class="num">${o.activity_count} act · ${o.payroll_count} pago · Q${esc(o.payroll_total)}</td>
        <td>
          <select data-old="${esc(o.old_worker_id)}">
            <option value="">— sin asignar —</option>
            ${options}
          </select>
        </td>
      </tr>`)
    .join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Reasignación de trabajadores — Finca Danilandia</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;background:#f6faf6;color:#1c2620}
.wrap{max-width:900px;margin:0 auto;padding:18px}
h1{font-size:20px}.sub{color:#5b6b60;font-size:14px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d1d5db;border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid #eef2ee;text-align:left;font-size:14px;vertical-align:top}
th{background:#f0fdf4;color:#166534;font-size:12px;text-transform:uppercase}
.meta{color:#5b6b60;font-size:12px}.num{white-space:nowrap;color:#5b6b60;font-size:13px}
tr.norec{opacity:.55}
select{width:100%;padding:6px;border:1px solid #d1d5db;border-radius:8px;font-size:13px}
.bar{position:sticky;top:0;background:#f6faf6;padding:10px 0;border-bottom:1px solid #d1d5db;margin-bottom:10px;z-index:5}
button{background:#15803d;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
#out{white-space:pre-wrap;background:#0b1f14;color:#d1fae5;border-radius:10px;padding:12px;font-size:12px;display:none;margin-top:10px}
</style></head><body><div class="wrap">
<h1>Reasignación de trabajadores</h1>
<p class="sub">Asigne cada registro antiguo a su trabajador correcto del padrón (SSOT). Los que tienen trabajos/pagos <b>deben</b> asignarse. Atenuados = sin registros.</p>
<div class="bar"><span id="counter" class="sub"></span> &nbsp; <button onclick="gen()">Generar resultado</button> <button onclick="copyOut()">Copiar</button></div>
<table><thead><tr><th>Registro antiguo</th><th>Carga</th><th>Trabajador correcto (padrón)</th></tr></thead><tbody>${rows}</tbody></table>
<div id="out"></div>
</div><script>
const sels=[...document.querySelectorAll('select[data-old]')];
function recount(){const total=sels.length,done=sels.filter(s=>s.value).length;document.getElementById('counter').textContent='Asignados: '+done+' / '+total;}
sels.forEach(s=>s.addEventListener('change',recount));recount();
function gen(){const map={};sels.forEach(s=>{if(s.value)map[s.dataset.old]=s.value;});const o=document.getElementById('out');o.style.display='block';o.textContent=JSON.stringify(map,null,2);o.scrollIntoView({behavior:'smooth'});}
function copyOut(){gen();navigator.clipboard.writeText(document.getElementById('out').textContent).then(()=>alert('Copiado. Guárdelo como map.json y envíelo.'));}
</script></body></html>`;

  const out = "reassignment-worksheet.html";
  writeFileSync(out, html);
  console.log(`✓ ${out} written — ${olds.length} old workers, ${ssot.length} SSOT options. Fill it, save the JSON, then --ingest.`);
}

async function ingest(file: string) {
  const map = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  const entries = Object.entries(map);
  console.log(`\n=== ingest ${entries.length} mappings — ${COMMIT ? "COMMIT" : "DRY-RUN"} ===\n`);

  const validWorkers = new Set((await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM public.workers`)).map((w) => w.id));
  const validOld = new Set((await prisma.$queryRawUnsafe<{ old_worker_id: string }[]>(`SELECT old_worker_id FROM public.worker_reassignment`)).map((w) => w.old_worker_id));
  const bad: string[] = [];
  for (const [oldId, newId] of entries) {
    if (!validOld.has(oldId)) bad.push(`unknown old_worker_id ${oldId}`);
    if (!validWorkers.has(newId)) bad.push(`unknown SSOT worker ${newId} (for ${oldId})`);
  }
  if (bad.length) { console.error("⛔ invalid mapping:\n  " + bad.join("\n  ")); await prisma.$disconnect(); process.exit(1); }
  console.log("✓ all ids valid.");

  if (!COMMIT) { console.log("\nDRY-RUN — nothing written. Re-run with --commit."); await prisma.$disconnect(); return; }
  let n = 0;
  for (const [oldId, newId] of entries) {
    n += await prisma.$executeRawUnsafe(
      `UPDATE public.worker_reassignment SET new_worker_id = $1::uuid, resolved_at = now() WHERE old_worker_id = $2::uuid`,
      newId, oldId,
    );
  }
  console.log(`\n✓ ${n} mappings written to worker_reassignment. Next: apply (06).`);
}

(async () => {
  if (ingestIdx >= 0) {
    const file = argv[ingestIdx + 1];
    if (!file) { console.error("--ingest requires a JSON file path"); process.exit(1); }
    await ingest(file);
  } else {
    await generate();
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FAILED:", e); await prisma.$disconnect(); process.exit(1); });
