// brito-bot · deja un post PROGRAMADO: GitHub lo publica solo a esa hora (hora de Mendoza),
// aunque la Mac esté apagada. Reemplaza la programación de Metricool.
//
// Reel:
//   node programar.mjs --archivo reel.mp4 --caption-archivo caption.txt --cuando "2026-11-11 21:00"
//     --bot "DECIDÍ VOS cap 2"     -> cuando salga, el bot responde sus comentarios
//     --frases-archivo f.txt       -> frases para esas respuestas (una por línea)
//     --votacion                   -> cuenta los votos A/B de ese reel
//     --anterior "DECIDÍ VOS cap 1" -> al capítulo anterior le cambia las respuestas a "ya salió el siguiente"
//     --sin-facebook               -> no lo sube también a la página de Facebook
//     --sin-feed                   -> solo en la pestaña Reels
// Carrusel (2 a 10 slides, MP4 / JPG / PNG, en orden alfabético):
//   node programar.mjs --carrusel carpeta/de/slides --caption-archivo caption.txt --cuando "2026-11-12 13:00"
// Historia (una imagen o video vertical 9:16):
//   node programar.mjs --historia historia.png --cuando "2026-11-12 20:55"
//
//   node programar.mjs --lista              -> muestra la cola
//   node programar.mjs --cancelar <carpeta> -> saca algo de la cola (si todavía no salió)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAIZ } from './lib/graph.mjs';
import { git, urlPages } from './lib/publicar.mjs';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (n) => process.argv.includes(n);
const COLA = path.join(RAIZ, 'docs/cola');

function subir(mensaje) {
  git('add', '-A', 'docs/cola');
  git('commit', '-q', '-m', mensaje);
  git('pull', '--rebase', '--autostash', '--quiet');
  git('push', '--quiet');
}

if (flag('--lista')) {
  for (const d of fs.readdirSync(COLA).filter((d) => fs.existsSync(path.join(COLA, d, 'info.json'))).sort()) {
    const i = JSON.parse(fs.readFileSync(path.join(COLA, d, 'info.json'), 'utf8'));
    const est = i.publicado ? `✅ salió ${i.publicado.permalink || ''}` : i.error ? `❌ ${i.error}` : '⏳ en espera';
    console.log(`${d}  ·  ${i.tipo || 'reel'}  ·  ${i.cuando_mendoza}  ·  ${est}`);
  }
  process.exit(0);
}

if (arg('--cancelar')) {
  const dir = path.join(COLA, arg('--cancelar'));
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
  if (info.publicado) {
    console.log('Eso ya salió; no se puede cancelar desde acá.');
    process.exit(1);
  }
  fs.rmSync(dir, { recursive: true });
  subir(`cola: cancelado ${arg('--cancelar')}`);
  console.log('🗑️  Sacado de la cola.');
  process.exit(0);
}

const tipo = arg('--carrusel') ? 'carrusel' : arg('--historia') ? 'historia' : 'reel';
const origen = arg('--carrusel') || arg('--historia') || arg('--archivo');
const cuando = arg('--cuando');
if (!origen || !cuando || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cuando)) {
  console.log('Faltan datos. Ejemplo: node programar.mjs --archivo reel.mp4 --caption-archivo caption.txt --cuando "2026-11-11 21:00"');
  process.exit(1);
}
const fecha = new Date(cuando.replace(' ', 'T') + ':00-03:00'); // Mendoza = UTC-3 todo el año
if (fecha.getTime() < Date.now() - 5 * 60 * 1000) console.log(`⚠️  ${cuando} ya pasó: sale en la próxima vuelta del bot (unos minutos).`);
const caption = arg('--caption-archivo') ? fs.readFileSync(arg('--caption-archivo'), 'utf8').trim() : arg('--caption') ?? '';
if (!caption && tipo !== 'historia') console.log('⚠️  Sin caption: igual se puede, pero sin texto no hay protección contra publicar dos veces.');

// Archivos de origen, en orden
let fuentes;
if (tipo === 'carrusel') {
  fuentes = fs.readdirSync(origen).filter((f) => /\.(mp4|mov|jpe?g|png)$/i.test(f)).sort().map((f) => path.join(origen, f));
  if (fuentes.length < 2 || fuentes.length > 10) {
    console.log(`Un carrusel lleva de 2 a 10 slides; en ${origen} hay ${fuentes.length}.`);
    process.exit(1);
  }
} else fuentes = [origen];

const base = (arg('--bot') || path.basename(origen, path.extname(origen)))
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const carpeta = `${cuando.replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')}-${tipo === 'reel' ? '' : tipo + '-'}${base}`;
const dir = path.join(COLA, carpeta);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// Copia (PNG -> JPG, que es lo que acepta Instagram)
const archivos = fuentes.map((f, i) => {
  const ext = path.extname(f).toLowerCase();
  const nombre = tipo === 'reel' ? 'video.mp4' : `${String(i + 1).padStart(2, '0')}${ext === '.png' ? '.jpg' : ext === '.jpeg' ? '.jpg' : ext}`;
  const destino = path.join(dir, nombre);
  if (ext === '.png') execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', f, '--out', destino], { stdio: 'ignore' });
  else fs.copyFileSync(f, destino);
  return nombre;
});

const info = {
  tipo,
  cuando: fecha.toISOString(),
  cuando_mendoza: cuando,
  caption,
  archivos,
  feed: !flag('--sin-feed'),
  facebook: tipo === 'reel' && !flag('--sin-facebook'),
  bot: arg('--bot') || null,
  frases: arg('--frases-archivo')
    ? fs.readFileSync(arg('--frases-archivo'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : null,
  votacion: flag('--votacion') ? ['A', 'B'] : null,
  anterior: arg('--anterior') || null,
};
fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info, null, 2) + '\n');
subir(`cola: ${carpeta}`);
console.log(`📅 ${tipo} programado para ${cuando} (Mendoza): docs/cola/${carpeta}`);
console.log(`   ${urlPages()}/cola/${carpeta}/${archivos[0]}`);
