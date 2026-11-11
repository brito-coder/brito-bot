// brito-bot · publica los reels de docs/cola cuya hora ya llegó. Lo corre GitHub cada ~5 minutos.
import fs from 'node:fs';
import path from 'node:path';
import { credenciales, RAIZ } from './lib/graph.mjs';
import { publicarReel, agregarAlBot, urlPages, urlLista, avisarAnterior } from './lib/publicar.mjs';

const COLA = path.join(RAIZ, 'docs/cola');
const { token, igId } = credenciales();
const ahora = Date.now();
const PRUEBA = process.argv.includes('--prueba'); // procesa sin publicar (para probar)
const forzar = process.argv[process.argv.indexOf('--forzar') + 1]; // ignora la hora de esa carpeta

for (const d of fs.readdirSync(COLA).sort()) {
  const archivoInfo = path.join(COLA, d, 'info.json');
  if (!fs.existsSync(archivoInfo)) continue;
  const info = JSON.parse(fs.readFileSync(archivoInfo, 'utf8'));
  if (info.publicado || (d !== forzar && new Date(info.cuando).getTime() > ahora)) continue;
  if ((info.intentos || 0) >= 5) continue; // ya falló 5 veces: queda marcado con el error

  const video = `${urlPages()}/cola/${d}/video.mp4`;
  if (!(await urlLista(video))) {
    console.log(`⏳ ${d}: GitHub Pages todavía no sirve el video, pruebo en la próxima vuelta.`);
    continue;
  }
  console.log(`📤 ${d} (programado ${info.cuando_mendoza})`);
  try {
    const r = await publicarReel({ igId, token, video, caption: info.caption, feed: info.feed !== false, prueba: PRUEBA });
    if (PRUEBA) continue;
    info.publicado = { media_id: r.mediaId, permalink: r.permalink, fecha: new Date().toISOString() };
    delete info.error;
    if (info.bot) agregarAlBot({ nombre: info.bot, permalink: r.permalink, mediaId: r.mediaId, frases: info.frases, votacion: info.votacion });
    if (info.anterior) avisarAnterior(info.anterior);
    fs.rmSync(path.join(COLA, d, 'video.mp4')); // ya salió: no hace falta guardar el video
  } catch (e) {
    info.intentos = (info.intentos || 0) + 1;
    info.error = e.message;
    console.log(`❌ ${d}: ${e.message} (intento ${info.intentos} de 5)`);
  }
  fs.writeFileSync(archivoInfo, JSON.stringify(info, null, 2) + '\n');
}
