// brito-bot · publica un reel en @brito.redes por la API oficial (sin límite de Metricool).
//
// Uso:
//   node publicar.mjs --video https://.../reel.mp4 --caption "Texto del reel"
//   node publicar.mjs --archivo ~/Desktop/reel.mp4 --caption-archivo caption.txt
//   Opcional: --bot "DECIDÍ VOS cap 2"  -> suma el reel nuevo a config/reels.json para que el bot responda
//             --sin-feed                -> solo en la pestaña Reels, no en el feed
//
// --archivo sube el MP4 a la página pública del repo (GitHub Pages) para que Instagram lo pueda bajar.
// Pasos de la API: 1) crear contenedor  2) esperar que Instagram procese el video  3) publicar.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { credenciales, graph, esperar, leerJSON, escribirJSON, RAIZ } from './lib/graph.mjs';

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const { token, igId } = credenciales();
let video = arg('--video');
const archivo = arg('--archivo');
let caption = arg('--caption') ?? '';
if (arg('--caption-archivo')) caption = fs.readFileSync(arg('--caption-archivo'), 'utf8').trim();
const nombreBot = arg('--bot');

if (!video && archivo) video = await subirAPages(archivo);
if (!video) {
  console.log('Falta el video: --video <link público al .mp4> o --archivo <ruta al .mp4>');
  process.exit(1);
}

console.log('1/3 Creando el contenedor del reel…');
const { id: contenedor } = await graph(
  'POST',
  `${igId}/media`,
  { media_type: 'REELS', video_url: video, caption, share_to_feed: !process.argv.includes('--sin-feed') },
  token,
);

console.log('2/3 Instagram está procesando el video…');
let estado = '';
for (let i = 0; i < 60; i++) {
  await esperar(10_000);
  const s = await graph('GET', contenedor, { fields: 'status_code,status' }, token);
  estado = s.status_code;
  process.stdout.write(`   ${estado}\n`);
  if (estado === 'FINISHED') break;
  if (estado === 'ERROR' || estado === 'EXPIRED') {
    console.log(`❌ Instagram no aceptó el video: ${s.status}`);
    process.exit(1);
  }
}
if (estado !== 'FINISHED') {
  console.log('❌ Pasaron 10 minutos y no terminó de procesar. Probá de nuevo más tarde.');
  process.exit(1);
}

console.log('3/3 Publicando…');
const { id: mediaId } = await graph('POST', `${igId}/media_publish`, { creation_id: contenedor }, token);
const info = await graph('GET', mediaId, { fields: 'permalink,shortcode' }, token);
console.log(`✅ Publicado: ${info.permalink}`);

if (nombreBot) {
  const config = leerJSON('config/reels.json', { reels: [] });
  const plantilla = config.frases_por_defecto || [];
  config.reels.push({ nombre: nombreBot, link: info.permalink, media_id: mediaId, activo: true, frases: plantilla });
  escribirJSON('config/reels.json', config);
  console.log(`🤖 "${nombreBot}" agregado al bot con ${plantilla.length} frases por defecto.`);
}

// Copia el MP4 a docs/videos, lo sube a GitHub y espera a que quede público en GitHub Pages.
async function subirAPages(ruta) {
  const nombre = path.basename(ruta).normalize('NFD').replace(/[^\w.-]+/g, '-');
  fs.copyFileSync(ruta, path.join(RAIZ, 'docs/videos', nombre));
  const git = (...a) => execFileSync('git', a, { cwd: RAIZ, stdio: 'inherit' });
  git('add', `docs/videos/${nombre}`);
  git('commit', '-m', `video: ${nombre}`);
  git('pull', '--rebase', '--quiet');
  git('push', '--quiet');
  const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: RAIZ }).toString();
  const [, dueño, repo] = remoto.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/);
  const url = `https://${dueño.toLowerCase()}.github.io/${repo}/videos/${nombre}`;
  console.log(`Subiendo a ${url} …`);
  for (let i = 0; i < 40; i++) {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r?.ok) return url;
    await esperar(15_000);
  }
  throw new Error('GitHub Pages no publicó el video a tiempo.');
}
