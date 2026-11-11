// brito-bot · informe semanal de métricas de los reels de @brito.redes.
// Escribe informes/AAAA-MM-DD.md. En GitHub, además, abre un "issue" con el informe
// (te llega por mail) — lo hace el workflow "Informe semanal".
//
// Uso: node metricas.mjs [cantidad de reels, por defecto 15]
import fs from 'node:fs';
import path from 'node:path';
import { credenciales, graph, RAIZ, leerJSON, escribirJSON } from './lib/graph.mjs';

const { token, igId } = credenciales();
const N = Number(process.argv[2]) || 15;
const METRICAS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time'];

const cuenta = await graph('GET', igId, { fields: 'username,followers_count,media_count' }, token);
const medios = (await graph('GET', `${igId}/media`, { fields: 'id,caption,media_product_type,permalink,timestamp', limit: 40 }, token)).data
  .filter((m) => m.media_product_type === 'REELS')
  .slice(0, N);

async function insights(id) {
  const out = {};
  try {
    const r = await graph('GET', `${id}/insights`, { metric: METRICAS.join(',') }, token);
    for (const m of r.data) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value;
  } catch {
    for (const met of METRICAS) {
      try {
        const r = await graph('GET', `${id}/insights`, { metric: met }, token);
        out[met] = r.data[0]?.values?.[0]?.value ?? r.data[0]?.total_value?.value;
      } catch { /* métrica no disponible para este reel */ }
    }
  }
  return out;
}

const filas = [];
for (const m of medios) filas.push({ ...m, ...(await insights(m.id)) });

// Seguidores: guardo el número de cada semana para ver cuánto creció
const hist = leerJSON('estado/seguidores.json', []);
const hoy = new Date().toISOString().slice(0, 10);
const anterior = hist.filter((h) => h.fecha < hoy).at(-1);
if (!hist.some((h) => h.fecha === hoy)) hist.push({ fecha: hoy, seguidores: cuenta.followers_count });
escribirJSON('estado/seguidores.json', hist);

const n = (x) => (x == null ? '–' : Number(x).toLocaleString('es-AR'));
const pct = (a, b) => (a != null && b ? `${((a / b) * 100).toFixed(1)} %` : '–');
const seg = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const titulo = (c) => (c || '(sin texto)').split('\n')[0].slice(0, 45).replace(/\|/g, '/');

const top = [...filas].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
const lineas = [
  `# Informe de @${cuenta.username} · ${hoy}`,
  '',
  `**Seguidores:** ${n(cuenta.followers_count)}${anterior ? ` (${cuenta.followers_count - anterior.seguidores >= 0 ? '+' : ''}${cuenta.followers_count - anterior.seguidores} desde el ${anterior.fecha})` : ''}`,
  '',
  `**El que más anduvo:** [${titulo(top[0]?.caption)}](${top[0]?.permalink}) con ${n(top[0]?.views)} vistas.`,
  '',
  `## Últimos ${filas.length} reels`,
  '',
  '| Fecha | Reel | Vistas | Alcance | Me gusta | Coment. | Compart. | Guard. | Interac. / alcance | Visto prom. |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...filas.map(
    (f) =>
      `| ${f.timestamp.slice(5, 10).split('-').reverse().join('/')} | [${titulo(f.caption)}](${f.permalink}) | ${n(f.views)} | ${n(f.reach)} | ${n(f.likes)} | ${n(f.comments)} | ${n(f.shares)} | ${n(f.saved)} | ${pct(f.total_interactions, f.reach)} | ${seg(f.ig_reels_avg_watch_time)} |`,
  ),
  '',
  '_Vistas = reproducciones. Alcance = cuentas distintas que lo vieron. "Interac. / alcance" mide cuánto engancha: más alto, mejor._',
];
fs.mkdirSync(path.join(RAIZ, 'informes'), { recursive: true });
const archivo = path.join(RAIZ, 'informes', `${hoy}.md`);
fs.writeFileSync(archivo, lineas.join('\n') + '\n');
escribirJSON('estado/metricas-ultimas.json', { fecha: hoy, seguidores: cuenta.followers_count, reels: filas });
console.log(lineas.join('\n'));
