// Publicación de reels compartida por publicar.mjs (a mano) y cola.mjs (programados).
import { graph, esperar, leerJSON, escribirJSON } from './graph.mjs';

const log = (...a) => console.log(...a);

// Si en las últimas 36 h ya hay un post con el mismo texto, devuelve ese (evita publicar dos veces).
export async function yaPublicado(igId, caption, token) {
  if (!caption) return null;
  const r = await graph('GET', `${igId}/media`, { fields: 'id,caption,permalink,timestamp', limit: 15 }, token);
  const limite = Date.now() - 36 * 3600 * 1000;
  const clave = caption.trim().slice(0, 120);
  return r.data.find((m) => new Date(m.timestamp).getTime() > limite && (m.caption || '').trim().slice(0, 120) === clave) || null;
}

export async function publicarReel({ igId, token, video, caption = '', feed = true, prueba = false }) {
  const previo = await yaPublicado(igId, caption, token);
  if (previo) {
    log(`⚠️  Ya había un reel con este mismo texto: ${previo.permalink}. No publico otro.`);
    return { mediaId: previo.id, permalink: previo.permalink, repetido: true };
  }
  log('1/3 Creando el contenedor del reel…');
  const { id: contenedor } = await graph(
    'POST',
    `${igId}/media`,
    { media_type: 'REELS', video_url: video, caption, share_to_feed: feed },
    token,
  );
  log('2/3 Instagram está procesando el video…');
  let estado = '';
  for (let i = 0; i < 60; i++) {
    await esperar(10_000);
    const s = await graph('GET', contenedor, { fields: 'status_code,status' }, token);
    estado = s.status_code;
    log(`   ${estado}`);
    if (estado === 'FINISHED') break;
    if (estado === 'ERROR' || estado === 'EXPIRED') throw new Error(`Instagram no aceptó el video: ${s.status}`);
  }
  if (estado !== 'FINISHED') throw new Error('Pasaron 10 minutos y el video no terminó de procesarse.');
  if (prueba) {
    log('✅ Prueba OK: Instagram aceptó y procesó el video. No se publicó nada (el borrador vence solo en 24 h).');
    return { prueba: true };
  }
  log('3/3 Publicando…');
  const { id: mediaId } = await graph('POST', `${igId}/media_publish`, { creation_id: contenedor }, token);
  const info = await graph('GET', mediaId, { fields: 'permalink' }, token);
  log(`✅ Publicado: ${info.permalink}`);
  return { mediaId, permalink: info.permalink };
}

// Suma un reel a config/reels.json para que el bot responda sus comentarios (y cuente votos).
export function agregarAlBot({ nombre, permalink, mediaId, frases, votacion }) {
  const config = leerJSON('config/reels.json', { reels: [] });
  if (config.reels.some((r) => r.media_id === mediaId)) return;
  const entrada = {
    nombre,
    link: permalink,
    media_id: mediaId,
    activo: true,
    frases: frases?.length ? frases : config.frases_por_defecto || [],
  };
  if (votacion) entrada.votacion = Array.isArray(votacion) ? votacion : ['A', 'B'];
  config.reels.push(entrada);
  escribirJSON('config/reels.json', config);
  log(`🤖 "${nombre}" agregado al bot con ${entrada.frases.length} frases${votacion ? ' y conteo de votos' : ''}.`);
}

// --- utilidades de git / GitHub Pages ---
import { execFileSync } from 'node:child_process';
import { RAIZ, esperar as _esperar } from './graph.mjs';

export const git = (...a) => execFileSync('git', a, { cwd: RAIZ, stdio: 'inherit' });

export function urlPages() {
  let completo = process.env.GITHUB_REPOSITORY; // "dueño/repo" dentro de GitHub Actions
  if (!completo) {
    const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: RAIZ }).toString();
    completo = remoto.match(/github\.com[/:]([^/]+\/[^/.\s]+)/)[1];
  }
  const [dueño, repo] = completo.split('/');
  return `https://${dueño.toLowerCase()}.github.io/${repo}`;
}

export async function urlLista(url) {
  const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
  return !!r?.ok;
}

export async function esperarPages(url, intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    if (await urlLista(url)) return url;
    await _esperar(15_000);
  }
  throw new Error('GitHub Pages no publicó el video a tiempo.');
}

// Cuando sale el capítulo siguiente, el anterior pasa a responder "ya salió" (y sigue contando votos).
export function avisarAnterior(nombre) {
  const config = leerJSON('config/reels.json', { reels: [] });
  const r = config.reels.find((x) => x.nombre === nombre);
  if (!r) return log(`⚠️  No encontré "${nombre}" en el bot para avisar que salió el siguiente.`);
  r.frases = config.frases_ya_salio || [
    '¡Ya salió el capítulo siguiente! 👀 Lo encontrás en el perfil.',
    'Llegaste tarde a votar 😅 pero ya está la continuación en el perfil.',
    '¡Gracias! El capítulo nuevo ya está en el perfil 🔥',
  ];
  escribirJSON('config/reels.json', config);
  log(`🔁 "${nombre}" ahora responde que ya salió el siguiente.`);
}
