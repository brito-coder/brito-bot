// brito-bot · responde en PÚBLICO los comentarios de la página de Facebook «Brito».
// Mira los posts y reels de la página de los últimos N días (config/reels.json -> "facebook").
// Igual que en Instagram: nunca manda mensajes privados y nunca responde dos veces.
import { credenciales, graph, todo, esperar, leerJSON, escribirJSON } from './lib/graph.mjs';

const PRUEBA = process.argv.includes('--prueba');
const { token } = credenciales();
const pagina = process.env.FB_PAGE_ID;
const cfg = leerJSON('config/reels.json', {}).facebook;
if (!cfg?.activo) {
  console.log('Facebook: apagado en config/reels.json');
  process.exit(0);
}
if (!pagina) {
  console.log('Facebook: falta FB_PAGE_ID (corré node configurar.mjs de nuevo).');
  process.exit(0);
}
const frases = cfg.frases?.length ? cfg.frases : leerJSON('config/reels.json', {}).frases_por_defecto;
const estado = leerJSON('estado/respondidos-facebook.json', { rotacion: 0, comentarios: {} });
const desde = Math.floor((Date.now() - (cfg.dias ?? 7) * 86400_000) / 1000);
const MAX = cfg.max_respuestas_por_vuelta ?? 20;

// Posts y reels recientes de la página
const objetos = new Map();
try {
  for (const p of await todo(`${pagina}/posts`, { fields: 'id,created_time', since: desde, limit: 25 }, token, 4)) objetos.set(p.id, p);
} catch (e) {
  console.log(`Facebook: no pude leer los posts de la página (${e.message.slice(0, 120)}). Falta renovar el token con los permisos nuevos.`);
  process.exit(0);
}
try {
  for (const r of await todo(`${pagina}/video_reels`, { fields: 'id,created_time', since: desde, limit: 25 }, token, 4)) objetos.set(r.id, r);
} catch (e) {
  console.log(`(no pude leer los reels de la página: ${e.message})`);
}

let enviadas = 0;
for (const obj of objetos.values()) {
  if (enviadas >= MAX) break;
  let comentarios;
  try {
    comentarios = await todo(`${obj.id}/comments`, { fields: 'id,from{id,name},message,created_time,comments{from{id}}', filter: 'toplevel', limit: 50 }, token, 5);
  } catch (e) {
    console.log(`⚠️  ${obj.id}: ${e.message}`);
    continue;
  }
  for (const c of comentarios) {
    if (enviadas >= MAX) break;
    if (estado.comentarios[c.id]) continue;
    if (c.from?.id === pagina) continue; // comentario de la propia página
    if ((c.comments?.data || []).some((r) => r.from?.id === pagina)) {
      estado.comentarios[c.id] = 'ya-tenia-respuesta';
      continue;
    }
    const frase = frases[estado.rotacion % frases.length].replaceAll('{usuario}', c.from?.name?.split(' ')[0] || '');
    if (PRUEBA) {
      console.log(`[prueba] FB · ${c.from?.name || '?'}: "${c.message}" -> "${frase}"`);
      estado.rotacion++;
      enviadas++;
      continue;
    }
    try {
      await graph('POST', `${c.id}/comments`, { message: frase }, token);
      estado.comentarios[c.id] = new Date().toISOString();
      estado.rotacion++;
      enviadas++;
      console.log(`✅ FB · ${c.from?.name || '?'} -> "${frase}"`);
      escribirJSON('estado/respondidos-facebook.json', estado);
      await esperar(4000 + Math.random() * 5000);
    } catch (e) {
      console.log(`❌ FB · ${c.id}: ${e.message}`);
      if ([4, 17, 32, 613, 368].includes(e.codigo)) break;
      if (e.codigo === 100) estado.comentarios[c.id] = 'no-se-pudo';
    }
  }
}
if (!PRUEBA) escribirJSON('estado/respondidos-facebook.json', estado);
console.log(`Facebook: ${objetos.size} posts/reels de los últimos ${cfg.dias ?? 7} días, ${enviadas} respuesta(s) ${PRUEBA ? 'simuladas' : 'publicadas'}.`);
