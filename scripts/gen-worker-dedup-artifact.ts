// Generates a standalone, send-to-Luis HTML artifact for resolving duplicate
// worker records. Read-only: queries prod, clusters likely-duplicates by
// rarity-weighted shared tokens, embeds the data + UI. No DB writes.
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
const p = new PrismaClient();

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const toks = (s: string) => norm(s).split(" ").filter(Boolean);
function lev(a: string, b: string) { const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++)d[0][j]=j; for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[m][n]; }
const sim = (a: string, b: string) => a===b?1:1-lev(a,b)/Math.max(a.length,b.length);

(async () => {
  const ws = await p.worker.findMany({ select: { id:true, fullName:true, isActive:true, dpi:true,
    _count: { select: { activityRecords:true, payrollEntries:true } } }, orderBy:{ fullName:"asc" } });
  const N = ws.length;
  const parent = ws.map((_, i) => i);
  const find = (x: number): number => parent[x]===x ? x : (parent[x]=find(parent[x]));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const wt = ws.map(w => toks(w.fullName));

  // HIGH-PRECISION same-person link (avoid common-surname mega-blobs):
  //   (a) subset: every token of the shorter name (>=2 tokens) fuzzy-appears in
  //       the longer — catches short canonical "AXEL ALVAREZ" ⊂ "Axel Amildo
  //       Alvarez Morales".
  //   (b) prefix3: the first THREE given names agree — catches a garbled LAST
  //       surname "Elmer Alexander Hernandez {Falloni|Flaillos|Raliois}".
  // Different first names sharing only common surnames do NOT link.
  const SIMT = 0.85;
  const tokIn = (t: string, arr: string[]) => arr.some(u => sim(t, u) >= SIMT);
  function linkSamePerson(A: string[], B: string[]): boolean {
    const short = A.length <= B.length ? A : B, long = A.length <= B.length ? B : A;
    // subset: every short token in long, first name aligned, AND the short's
    // surname (short[1]) sits in the long's PRIMARY-surname region (long[1] or
    // long[2]) — so a trailing 2nd surname can't bridge unrelated people.
    const subset = short.length >= 2 && short.every(t => tokIn(t, long))
      && sim(short[0], long[0]) >= SIMT
      && (sim(short[1], long[1]) >= SIMT || sim(short[1], long[2] ?? "") >= SIMT);
    const prefix3 = A.length >= 3 && B.length >= 3 &&
      sim(A[0], B[0]) >= SIMT && sim(A[1], B[1]) >= SIMT && sim(A[2], B[2]) >= SIMT;
    return subset || prefix3;
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (linkSamePerson(wt[i], wt[j])) union(i, j);
  }
  const groups = new Map<number, number[]>();
  ws.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });
  const clusters = [...groups.values()].filter(g => g.length > 1)
    .map(g => g.map(i => ws[i]).sort((a,b)=> b._count.activityRecords - a._count.activityRecords))
    .sort((a,b)=> b.length - a.length);
  const singles = [...groups.values()].filter(g => g.length === 1).map(g => ws[g[0]]);

  console.log(`Clusters: ${clusters.length} grupos, ${clusters.reduce((s,c)=>s+c.length,0)} registros agrupados; ${singles.length} sin duplicados.`);
  clusters.slice(0,8).forEach(c => console.log("  •", c.map(w=>`${w.fullName}(${w._count.activityRecords})`).join("  |  ")));

  const data = {
    generatedAt: new Date().toISOString().split("T")[0],
    totalWorkers: N,
    clusters: clusters.map(c => c.map(w => ({ id:w.id, name:w.fullName, recs:w._count.activityRecords, pays:w._count.payrollEntries, active:w.isActive }))),
    singles: singles.map(w => ({ id:w.id, name:w.fullName, recs:w._count.activityRecords })),
  };
  const html = buildHtml(data);
  const out = path.join(__dirname, "..", "revision-trabajadores.html");
  fs.writeFileSync(out, html);
  console.log("\nWritten:", out, `(${(html.length/1024).toFixed(0)} KB)`);
  await p.$disconnect();
})();

function buildHtml(data: any): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión de Trabajadores — Finca Danilandia</title>
<style>
:root{--g:#15803d;--g2:#166534;--bg:#f6faf6;--bd:#d1d5db;--am:#b45309}
*{box-sizing:border-box}body{font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:#1c2620;line-height:1.45}
.wrap{max-width:780px;margin:0 auto;padding:18px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#5b6b60;font-size:14px;margin:0 0 16px}
.intro{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:14px 16px;font-size:14px;margin-bottom:16px}
.intro b{color:var(--g2)}
.bar{position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:5;border-bottom:1px solid var(--bd);margin-bottom:8px}
.bar .count{font-size:13px;color:#5b6b60}
.card{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px 14px;margin-bottom:12px}
.card.done{border-color:var(--g)}
.ghead{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b60;margin-bottom:8px}
.row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;border:1px solid #eef2ee;margin-bottom:6px;flex-wrap:wrap}
.row.keep{background:#f0fdf4;border-color:#bbf7d0}.row.distinct{background:#fff7ed;border-color:#fed7aa;opacity:.85}
.nm{font-weight:600;font-size:15px;flex:1;min-width:160px}
.meta{font-size:12px;color:#5b6b60;white-space:nowrap}
.seg{display:inline-flex;border:1px solid var(--bd);border-radius:8px;overflow:hidden}
.seg button{border:0;background:#fff;padding:6px 10px;font-size:12px;font-weight:600;color:#5b6b60;cursor:pointer}
.seg button.on-keep{background:var(--g);color:#fff}.seg button.on-merge{background:#2563eb;color:#fff}.seg button.on-dist{background:var(--am);color:#fff}
.actions{position:sticky;bottom:0;background:var(--bg);padding:12px 0;border-top:1px solid var(--bd);display:flex;gap:10px;flex-wrap:wrap}
.btn{background:var(--g);color:#fff;border:0;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer}
.btn.alt{background:#fff;color:var(--g2);border:1px solid var(--g)}
textarea{width:100%;border:1px solid var(--bd);border-radius:10px;padding:10px;font-size:14px;font-family:inherit}
details{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:8px 14px;margin-bottom:12px}
summary{cursor:pointer;font-weight:600;font-size:14px}
.slist{columns:2;font-size:13px;color:#5b6b60;margin-top:8px}@media(max-width:520px){.slist{columns:1}}
#out{white-space:pre-wrap;background:#0b1f14;color:#d1fae5;border-radius:10px;padding:12px;font-size:12px;display:none;margin-top:10px}
.legend{font-size:12px;color:#5b6b60;margin:6px 0 14px}.chip{display:inline-block;padding:2px 7px;border-radius:6px;font-weight:600;margin-right:6px}
.c-k{background:var(--g);color:#fff}.c-m{background:#2563eb;color:#fff}.c-d{background:var(--am);color:#fff}
</style></head><body><div class="wrap">
<h1>Revisión de Trabajadores Duplicados</h1>
<p class="sub">Finca Danilandia · ${data.totalWorkers} trabajadores · generado ${data.generatedAt}</p>
<div class="intro">
Algunos trabajadores parecen estar <b>repetidos</b> (el mismo nombre escrito de varias formas). Usted que los conoce, ayúdenos a limpiarlos.<br><br>
En cada grupo, para cada registro elija:
<div class="legend"><span class="chip c-k">Conservar</span>el registro correcto (uno por grupo) &nbsp; <span class="chip c-m">Fusionar</span>es la misma persona &nbsp; <span class="chip c-d">Distinta</span>es otra persona</div>
Lo de <b>Fusionar</b> se unirá al que marque <b>Conservar</b>. <b>“X registros”</b> = cuántos trabajos tiene ese registro (el correcto suele tener más). No se cambia nada hasta que usted nos envíe el resultado.
</div>
<div class="bar"><span class="count" id="counter"></span></div>
<div id="groups"></div>
<details><summary>${data.singles.length} trabajadores sin duplicados detectados (referencia)</summary>
<div class="slist">${data.singles.map((s:any)=>`<div>${esc(s.name)}</div>`).join("")}</div></details>
<p class="sub">¿Conoce un duplicado que no aparece arriba? Escríbalo aquí:</p>
<textarea id="notes" rows="3" placeholder="Ej: 'Fulano X' y 'Fulano Y' son la misma persona..."></textarea>
<div class="actions">
<button class="btn" onclick="gen()">Generar resultado para enviar</button>
<button class="btn alt" onclick="copyOut()">Copiar</button>
</div>
<div id="out"></div>
</div>
<script>
const DATA = ${JSON.stringify(data)};
const state = DATA.clusters.map(c => c.map((m,i)=> i===0 ? 'keep' : 'merge')); // default: most-records = keep
function setSel(gi, mi, v){ const g=state[gi]; if(v==='keep'){ for(let k=0;k<g.length;k++) if(g[k]==='keep') g[k]='merge'; } g[mi]=v; render(); }
function groupDone(gi){ return state[gi].includes('keep'); }
function render(){
  const root=document.getElementById('groups'); root.innerHTML='';
  DATA.clusters.forEach((c,gi)=>{
    const card=document.createElement('div'); card.className='card'+(groupDone(gi)?' done':'');
    card.innerHTML='<div class="ghead">Grupo '+(gi+1)+' · '+c.length+' registros</div>';
    c.forEach((m,mi)=>{
      const sel=state[gi][mi];
      const row=document.createElement('div'); row.className='row'+(sel==='keep'?' keep':sel==='dist'?' distinct':'');
      row.innerHTML='<span class="nm">'+esc(m.name)+'</span><span class="meta">'+m.recs+' registros · '+m.pays+' pagos'+(m.active?'':' · inactivo')+'</span>'+
        '<span class="seg">'+
        '<button class="'+(sel==='keep'?'on-keep':'')+'" onclick="setSel('+gi+','+mi+',\\'keep\\')">Conservar</button>'+
        '<button class="'+(sel==='merge'?'on-merge':'')+'" onclick="setSel('+gi+','+mi+',\\'merge\\')">Fusionar</button>'+
        '<button class="'+(sel==='dist'?'on-dist':'')+'" onclick="setSel('+gi+','+mi+',\\'dist\\')">Distinta</button>'+
        '</span>';
      card.appendChild(row);
    });
    root.appendChild(card);
  });
  const done=DATA.clusters.filter((_,gi)=>groupDone(gi)).length;
  document.getElementById('counter').textContent='Grupos resueltos: '+done+' / '+DATA.clusters.length;
}
function gen(){
  const res={generado:DATA.generatedAt, decisiones:[]};
  DATA.clusters.forEach((c,gi)=>{
    const g=state[gi]; const keepIdx=g.indexOf('keep');
    const keep=keepIdx>=0?c[keepIdx]:null;
    const merge=c.filter((m,i)=>g[i]==='merge');
    const dist=c.filter((m,i)=>g[i]==='dist');
    if(merge.length||dist.length) res.decisiones.push({
      conservar: keep?{id:keep.id,nombre:keep.name}:null,
      fusionar: merge.map(m=>({id:m.id,nombre:m.name})),
      distintas: dist.map(m=>({id:m.id,nombre:m.name}))
    });
  });
  res.notas=document.getElementById('notes').value||'';
  const o=document.getElementById('out'); o.style.display='block'; o.textContent=JSON.stringify(res,null,2);
  o.scrollIntoView({behavior:'smooth'});
}
function copyOut(){ const o=document.getElementById('out'); if(o.style.display==='none')gen(); navigator.clipboard.writeText(o.textContent).then(()=>alert('Copiado. Péguelo en el mensaje y envíelo.')); }
function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
render();
</script></body></html>`;
}
function esc(s: string){ return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"} as any)[c]); }
