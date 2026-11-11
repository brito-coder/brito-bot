// brito-bot · publica lo que está en docs/cola cuando llega su hora. Lo corre GitHub cada ~5 minutos.
//   node cola.mjs --prueba [--forzar <carpeta>]  -> procesa sin publicar (para probar)
import fs from 'node:fs';
import path from 'node:path';
import { credenciales, RAIZ, leerJSON } from './lib/graph.mjs';
import {
  publicarReel, publicarCarrusel, publicarHistoria, publicarReelFacebook,
  agregarAlBot, avisarAnterior, urlPages, urlLista,
} from './lib/publicar.mjs';

const COLA = path.join(RAIZ, 'docs/cola');
const { token, igId } = credenciales();
const ahora = Date.now();
const PRUEBA = process.argv.includes('--prueba');
const forzar = process.argv.includes('--forzar') ? process.argv[process.argv.indexOf('--forzar') + 1] : null;
const fbCfg = leerJSON('config/reels.json', {}).facebook || {};

for (const d of fs.readdirSync(COLA).sort()) {
  const archivoInfo = path.join(COLA, d, 'info.json');
  if (!fs.existsSync(archivoInfo)) continue;
  const info = JSON.parse(fs.readFileSync(archivoInfo, 'utf8'));
  const tipo = info.tipo || 'reel';
  const archivos = info.archivos || ['video.mp4'];

  // Limpieza: 2 días después de publicado, borra los archivos (ya no hacen falta)
  if (info.publicado) {
    if (Date.now() - new Date(info.publicado.fecha).getTime() > 2 * 86400_000) {
      for (const a of archivos) fs.rmSync(path.join(COLA, d, a), { force: true });
    }
    continue;
  }
  if (d !== forzar && new Date(info.cuando).getTime() > ahora) continue;
  if ((info.intentos || 0) >= 5) continue; // falló 5 veces: queda marcado con el error

  const urls = archivos.map((a) => `${urlPages()}/cola/${d}/${a}`);
  if (!(await urlLista(urls[0]))) {
    console.log(`⏳ ${d}: GitHub Pages todavía no sirve los archivos, pruebo en la próxima vuelta.`);
    continue;
  }
  console.log(`📤 ${d} · ${tipo} (programado ${info.cuando_mendoza})`);
  try {
    let r;
    if (tipo === 'carrusel') r = await publicarCarrusel({ igId, token, archivos: urls, caption: info.caption, prueba: PRUEBA });
    else if (tipo === 'historia') r = await publicarHistoria({ igId, token, archivo: urls[0], prueba: PRUEBA });
    else r = await publicarReel({ igId, token, video: urls[0], caption: info.caption, feed: info.feed !== false, prueba: PRUEBA });
    if (PRUEBA) continue;

    info.publicado = { media_id: r.mediaId, permalink: r.permalink, fecha: new Date().toISOString() };
    delete info.error;
    if (info.bot) agregarAlBot({ nombre: info.bot, permalink: r.permalink, mediaId: r.mediaId, frases: info.frases, votacion: info.votacion });
    if (info.anterior) avisarAnterior(info.anterior);

    // También en la página de Facebook (si está prendido y es un reel)
    if (tipo === 'reel' && info.facebook !== false && fbCfg.publicar_reels && process.env.FB_PAGE_ID && !r.repetido) {
      try {
        const f = await publicarReelFacebook({ pageId: process.env.FB_PAGE_ID, token, video: urls[0], descripcion: info.caption });
        info.publicado.facebook = f.permalink;
      } catch (e) {
        info.publicado.facebook_error = e.message;
        console.log(`⚠️  Instagram OK, pero Facebook falló: ${e.message}`);
      }
    }
  } catch (e) {
    info.intentos = (info.intentos || 0) + 1;
    info.error = e.message;
    console.log(`❌ ${d}: ${e.message} (intento ${info.intentos} de 5)`);
  }
  fs.writeFileSync(archivoInfo, JSON.stringify(info, null, 2) + '\n');
}
