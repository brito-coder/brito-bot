// brito-bot · publica un reel YA en @brito.redes por la API oficial (sin límite de Metricool).
// Para dejarlo programado para más tarde usá programar.mjs.
//
// Uso:
//   node publicar.mjs --video https://.../reel.mp4 --caption "Texto del reel"
//   node publicar.mjs --archivo ~/Desktop/reel.mp4 --caption-archivo caption.txt
//   Opcional: --bot "DECIDÍ VOS cap 2"  -> suma el reel nuevo al bot para que responda sus comentarios
//             --frases-archivo f.txt    -> frases del bot para este reel (una por línea)
//             --votacion                -> además cuenta los votos A/B de este reel
//             --sin-feed                -> solo en la pestaña Reels, no en el feed
//             --prueba                  -> hace todo menos el último paso: no publica nada
//
// --archivo sube el MP4 a la página pública del repo (GitHub Pages) para que Instagram lo pueda bajar.
import fs from 'node:fs';
import path from 'node:path';
import { credenciales, RAIZ } from './lib/graph.mjs';
import { publicarReel, agregarAlBot, git, urlPages, esperarPages } from './lib/publicar.mjs';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (n) => process.argv.includes(n);

const { token, igId } = credenciales();
let video = arg('--video');
let caption = arg('--caption') ?? '';
if (arg('--caption-archivo')) caption = fs.readFileSync(arg('--caption-archivo'), 'utf8').trim();
const frases = arg('--frases-archivo')
  ? fs.readFileSync(arg('--frases-archivo'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : null;

try {
  if (!video && arg('--archivo')) {
    const nombre = path.basename(arg('--archivo')).normalize('NFD').replace(/[^\w.-]+/g, '-');
    fs.copyFileSync(arg('--archivo'), path.join(RAIZ, 'docs/videos', nombre));
    git('add', `docs/videos/${nombre}`);
    git('commit', '-q', '-m', `video: ${nombre}`);
    git('pull', '--rebase', '--autostash', '--quiet');
    git('push', '--quiet');
    video = `${urlPages()}/videos/${nombre}`;
    console.log(`Subiendo a ${video} …`);
    await esperarPages(video);
  }
  if (!video) {
    console.log('Falta el video: --video <link público al .mp4> o --archivo <ruta al .mp4>');
    process.exit(1);
  }
  const r = await publicarReel({ igId, token, video, caption, feed: !flag('--sin-feed'), prueba: flag('--prueba') });
  if (arg('--bot') && r.mediaId) {
    agregarAlBot({ nombre: arg('--bot'), permalink: r.permalink, mediaId: r.mediaId, frases, votacion: flag('--votacion') });
  }
} catch (e) {
  console.log(`❌ ${e.message}`);
  process.exit(1);
}
