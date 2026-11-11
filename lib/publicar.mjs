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

async function esperarContenedor(contenedor, token, etiqueta = '') {
  for (let i = 0; i < 60; i++) {
    await esperar(i === 0 ? 3000 : 10_000);
    const s = await graph('GET', contenedor, { fields: 'status_code,status' }, token);
    log(`   ${etiqueta}${s.status_code}`);
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram no aceptó ${etiqueta || 'el archivo'}: ${s.status}`);
  }
  throw new Error('Pasaron 10 minutos y no terminó de procesarse.');
}

async function confirmar(igId, token, contenedor, prueba) {
  if (prueba) {
    log('✅ Prueba OK: Instagram aceptó y procesó todo. No se publicó nada (el borrador vence solo en 24 h).');
    return { prueba: true };
  }
  log('Publicando…');
  const { id: mediaId } = await graph('POST', `${igId}/media_publish`, { creation_id: contenedor }, token);
  const info = await graph('GET', mediaId, { fields: 'permalink' }, token).catch(() => ({}));
  log(`✅ Publicado: ${info.permalink || mediaId}`);
  return { mediaId, permalink: info.permalink };
}

const esVideo = (url) => /\.(mp4|mov)(\?|$)/i.test(url);

export async function publicarReel({ igId, token, video, caption = '', feed = true, prueba = false }) {
  const previo = await yaPublicado(igId, caption, token);
  if (previo) {
    log(`⚠️  Ya había un post con este mismo texto: ${previo.permalink}. No publico otro.`);
    return { mediaId: previo.id, permalink: previo.permalink, repetido: true };
  }
  log('Creando el reel…');
  const { id } = await graph('POST', `${igId}/media`, { media_type: 'REELS', video_url: video, caption, share_to_feed: feed }, token);
  await esperarContenedor(id, token);
  return confirmar(igId, token, id, prueba);
}

// Carrusel: de 2 a 10 archivos (JPG o MP4), en orden.
export async function publicarCarrusel({ igId, token, archivos, caption = '', prueba = false }) {
  if (archivos.length < 2 || archivos.length > 10) throw new Error(`Un carrusel lleva de 2 a 10 archivos (hay ${archivos.length}).`);
  const previo = await yaPublicado(igId, caption, token);
  if (previo) {
    log(`⚠️  Ya había un post con este mismo texto: ${previo.permalink}. No publico otro.`);
    return { mediaId: previo.id, permalink: previo.permalink, repetido: true };
  }
  const hijos = [];
  for (const [i, url] of archivos.entries()) {
    const p = esVideo(url) ? { media_type: 'VIDEO', video_url: url } : { image_url: url };
    const { id } = await graph('POST', `${igId}/media`, { ...p, is_carousel_item: true }, token);
    log(`Slide ${i + 1}/${archivos.length} subida`);
    hijos.push(id);
  }
  for (const [i, id] of hijos.entries()) await esperarContenedor(id, token, `slide ${i + 1}: `);
  const { id } = await graph('POST', `${igId}/media`, { media_type: 'CAROUSEL', children: hijos.join(','), caption }, token);
  await esperarContenedor(id, token, 'carrusel: ');
  return confirmar(igId, token, id, prueba);
}

// Historia: una imagen (JPG) o un video (MP4) vertical 9:16.
export async function publicarHistoria({ igId, token, archivo, prueba = false }) {
  const p = esVideo(archivo) ? { video_url: archivo } : { image_url: archivo };
  log('Creando la historia…');
  const { id } = await graph('POST', `${igId}/media`, { media_type: 'STORIES', ...p }, token);
  await esperarContenedor(id, token);
  return confirmar(igId, token, id, prueba);
}

// Reel en la página de Facebook (API de reels de páginas). Necesita pages_manage_posts.
export async function publicarReelFacebook({ pageId, token, video, descripcion = '', prueba = false }) {
  if (prueba) {
    log('(prueba) Facebook: no publico.');
    return { prueba: true };
  }
  // No repetir: si la página ya tiene un reel con la misma descripción en las últimas 36 h, no subo otro
  try {
    const previos = await graph('GET', `${pageId}/video_reels`, { fields: 'id,description,created_time', limit: 10 }, token);
    const clave = descripcion.trim().slice(0, 120);
    const limite = Date.now() - 36 * 3600 * 1000;
    const rep = (previos.data || []).find((v) => new Date(v.created_time).getTime() > limite && (v.description || '').trim().slice(0, 120) === clave);
    if (clave && rep) {
      log(`⚠️  Facebook ya tiene este reel (${rep.id}). No subo otro.`);
      return { videoId: rep.id, permalink: `https://www.facebook.com/reel/${rep.id}`, repetido: true };
    }
  } catch { /* si no puedo chequear, sigo */ }
  const VERSION = process.env.GRAPH_VERSION || 'v25.0';
  const ini = await graph('POST', `${pageId}/video_reels`, { upload_phase: 'start' }, token);
  const res = await fetch(`https://rupload.facebook.com/video-upload/${VERSION}/${ini.video_id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: video },
  });
  const sub = await res.json().catch(() => ({}));
  if (!res.ok || !sub.success) throw new Error(`Facebook no pudo bajar el video: ${JSON.stringify(sub).slice(0, 200)}`);
  await graph('POST', `${pageId}/video_reels`, { upload_phase: 'finish', video_id: ini.video_id, video_state: 'PUBLISHED', description: descripcion }, token);
  for (let i = 0; i < 30; i++) {
    await esperar(10_000);
    const s = await graph('GET', ini.video_id, { fields: 'status' }, token);
    const fase = s.status?.video_status;
    if (fase === 'ready' || s.status?.publishing_phase?.status === 'complete') break;
    if (fase === 'error') throw new Error(`Facebook rechazó el video: ${JSON.stringify(s.status).slice(0, 200)}`);
  }
  log(`✅ También en Facebook: https://www.facebook.com/reel/${ini.video_id}`);
  return { videoId: ini.video_id, permalink: `https://www.facebook.com/reel/${ini.video_id}` };
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
