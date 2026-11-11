// brito-bot · cuenta los votos A/B de los reels con "votacion" en config/reels.json.
//
// Uso:
//   node votos.mjs                 -> cuenta todos y guarda estado/votos.json
//   node votos.mjs "DECIDÍ VOS"    -> muestra solo los reels cuyo nombre contenga eso
//
// Reglas: un voto por persona (vale el último que dejó), no cuenta los de @brito.redes,
// y si un comentario nombra las dos opciones no cuenta para ninguna.
import { credenciales, graph, todo, leerJSON, escribirJSON, shortcodeDe } from './lib/graph.mjs';

const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Devuelve la opción que vota un comentario, o null si no se entiende o nombra más de una.
export function leerVoto(texto, opciones) {
  const original = String(texto || '');
  const t = normalizar(original).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const encontradas = new Set();
  for (const op of opciones) {
    const o = normalizar(op);
    if (t === o) { encontradas.add(op); continue; }
    // "la a", "opcion a", "la opcion b", "el a", "voto b", "elijo la a"
    if (new RegExp(`(^|\\s)(la|el|opcion|voto|elijo|la opcion)\\s${o}(\\s|$)`).test(t)) { encontradas.add(op); continue; }
    // letra suelta en mayúscula en el original ("El A y lo denuncio")
    if (op.length === 1 && new RegExp(`(^|[^\\p{L}])${op.toUpperCase()}([^\\p{L}]|$)`, 'u').test(original)) {
      encontradas.add(op);
      continue;
    }
    // la letra sola al principio o al final ("b jaja", "yo b")
    if (op.length === 1 && (t.startsWith(o + ' ') || t.endsWith(' ' + o))) encontradas.add(op);
  }
  return encontradas.size === 1 ? [...encontradas][0] : null;
}

export async function contar(mediaId, opciones, token, miUsuario) {
  const comentarios = await todo(`${mediaId}/comments`, { fields: 'text,username,timestamp', limit: 50 }, token);
  comentarios.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const porPersona = new Map();
  let sinVoto = 0;
  for (const c of comentarios) {
    if (c.username?.toLowerCase() === miUsuario) continue;
    const v = leerVoto(c.text, opciones);
    if (v) porPersona.set(c.username, v);
    else sinVoto++;
  }
  const total = Object.fromEntries(opciones.map((o) => [o, 0]));
  for (const v of porPersona.values()) total[v]++;
  const orden = Object.entries(total).sort((a, b) => b[1] - a[1]);
  const ganador = orden[0][1] > orden[1][1] ? orden[0][0] : 'empate';
  return { total, ganador, votantes: porPersona.size, comentarios_sin_voto: sinVoto, contado: new Date().toISOString() };
}

// Ejecutado directo (no importado)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { token, igId } = credenciales();
  const filtro = process.argv[2] ? normalizar(process.argv[2]) : null;
  const config = leerJSON('config/reels.json', { reels: [] });
  const cache = leerJSON('estado/ids-de-reels.json', {});
  const resultado = leerJSON('estado/votos.json', {});
  const yo = (await graph('GET', igId, { fields: 'username' }, token)).username.toLowerCase();

  for (const r of config.reels) {
    if (!r.votacion) continue;
    if (filtro && !normalizar(r.nombre).includes(filtro)) continue;
    const id = r.media_id || cache[shortcodeDe(r.link)];
    if (!id) {
      console.log(`⚠️  ${r.nombre}: todavía no tengo el id (corre primero comentarios.mjs)`);
      continue;
    }
    const opciones = Array.isArray(r.votacion) ? r.votacion : ['A', 'B'];
    const res = { nombre: r.nombre, link: r.link, ...(await contar(id, opciones, token, yo)) };
    resultado[id] = res;
    const linea = opciones.map((o) => `${o}: ${res.total[o]}`).join(' · ');
    console.log(`🗳️  ${r.nombre} → ${linea} → ganó ${res.ganador} (${res.votantes} personas)`);
  }
  escribirJSON('estado/votos.json', resultado);
}
