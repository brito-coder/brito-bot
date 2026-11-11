// brito-bot · respuestas públicas a comentarios de reels elegidos.
//
// Uso:
//   node comentarios.mjs            -> responde de verdad
//   node comentarios.mjs --prueba   -> muestra qué respondería, sin publicar nada
//
// Reglas que este script cumple siempre:
//   - Solo responde en PÚBLICO, debajo del comentario. Nunca manda mensajes directos.
//   - Nunca responde dos veces el mismo comentario (registro en estado/respondidos.json
//     y, además, mira si la cuenta ya tiene una respuesta ahí, aunque la hayas escrito vos a mano).
//   - Solo toca los reels que estén en config/reels.json con "activo": true.
import { credenciales, graph, todo, esperar, leerJSON, escribirJSON, shortcodeDe } from './lib/graph.mjs';

const PRUEBA = process.argv.includes('--prueba');
const { token, igId } = credenciales();

const config = leerJSON('config/reels.json', { reels: [] });
const estado = leerJSON('estado/respondidos.json', {});
const cacheIds = leerJSON('estado/ids-de-reels.json', {});
const MAX = config.max_respuestas_por_vuelta ?? 30;

const yo = await graph('GET', igId, { fields: 'username' }, token);
const miUsuario = yo.username.toLowerCase();

// Convierte cada link de reel en el id interno que usa la API (y lo guarda para no buscarlo de nuevo).
async function idDelReel(reel) {
  if (reel.media_id) return reel.media_id;
  const sc = shortcodeDe(reel.link);
  if (!sc) throw new Error(`No entiendo el link del reel "${reel.nombre}": ${reel.link}`);
  if (cacheIds[sc]) return cacheIds[sc];
  const medios = await todo(`${igId}/media`, { fields: 'id,shortcode,permalink', limit: 50 }, token, 10);
  for (const m of medios) if (m.shortcode) cacheIds[m.shortcode] = m.id;
  if (!cacheIds[sc]) throw new Error(`No encontré el reel "${reel.nombre}" (${sc}) en @${miUsuario}`);
  return cacheIds[sc];
}

const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let enviadas = 0;
let cortar = false;

for (const reel of config.reels.filter((r) => r.activo !== false)) {
  if (cortar) break;
  if (!reel.frases?.length) {
    console.log(`⚠️  "${reel.nombre}" no tiene frases, lo salteo.`);
    continue;
  }
  let mediaId;
  try {
    mediaId = await idDelReel(reel);
  } catch (e) {
    console.log(`⚠️  ${e.message}`);
    continue;
  }
  const reg = (estado[mediaId] ??= { nombre: reel.nombre, rotacion: 0, comentarios: {} });
  reg.nombre = reel.nombre;

  const comentarios = await todo(
    `${mediaId}/comments`,
    { fields: 'id,text,username,timestamp,replies{username}', limit: 50 },
    token,
  );
  // Del más viejo al más nuevo, así se responde en orden.
  comentarios.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let nuevos = 0;
  for (const c of comentarios) {
    if (reg.comentarios[c.id]) continue; // ya respondido
    if (c.username?.toLowerCase() === miUsuario) continue; // comentario propio
    if ((c.replies?.data || []).some((r) => r.username?.toLowerCase() === miUsuario)) {
      reg.comentarios[c.id] = 'ya-tenia-respuesta';
      continue;
    }
    if (reel.solo_desde && c.timestamp < reel.solo_desde) continue;
    if (reel.solo_si_contiene?.length) {
      const t = normalizar(c.text || '');
      if (!reel.solo_si_contiene.some((p) => t.includes(normalizar(p)))) continue;
    }
    if (enviadas >= MAX) {
      cortar = true;
      break;
    }

    const frase = reel.frases[reg.rotacion % reel.frases.length].replaceAll('{usuario}', '@' + c.username);
    if (PRUEBA) {
      console.log(`[prueba] ${reel.nombre} · @${c.username}: "${c.text}" -> "${frase}"`);
      enviadas++;
      reg.rotacion++;
      continue;
    }
    try {
      await graph('POST', `${c.id}/replies`, { message: frase }, token);
      reg.comentarios[c.id] = new Date().toISOString();
      reg.rotacion++;
      enviadas++;
      nuevos++;
      console.log(`✅ ${reel.nombre} · @${c.username} -> "${frase}"`);
      escribirJSON('estado/respondidos.json', estado); // se guarda después de cada respuesta
      await esperar(4000 + Math.random() * 5000); // pausa para que Instagram no lo tome como spam
    } catch (e) {
      console.log(`❌ ${reel.nombre} · comentario ${c.id}: ${e.message}`);
      if ([4, 17, 32, 613, 368].includes(e.codigo)) {
        console.log('⏸️  Instagram pidió frenar. Sigo en la próxima vuelta.');
        cortar = true;
        break;
      }
      if (e.codigo === 100) reg.comentarios[c.id] = 'no-se-pudo'; // borrado u oculto: no reintentar
    }
  }
  console.log(`· ${reel.nombre}: ${comentarios.length} comentarios, ${nuevos} respuestas nuevas`);
}

if (!PRUEBA) escribirJSON('estado/respondidos.json', estado);
escribirJSON('estado/ids-de-reels.json', cacheIds);
console.log(`Listo: ${enviadas} respuesta(s) ${PRUEBA ? 'simuladas' : 'publicadas'}.`);
