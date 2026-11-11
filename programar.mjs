// brito-bot · deja un reel PROGRAMADO: GitHub lo publica solo a esa hora (hora de Mendoza),
// aunque la Mac esté apagada. Reemplaza la programación de Metricool.
//
// Uso:
//   node programar.mjs --archivo reel.mp4 --caption-archivo caption.txt --cuando "2026-11-11 21:00"
//   Opcional: --bot "DECIDÍ VOS cap 2"   -> cuando salga, el bot responde sus comentarios
//             --frases-archivo f.txt     -> frases para esas respuestas (una por línea)
//             --votacion                 -> cuenta los votos A/B de ese reel
//             --sin-feed                 -> solo en la pestaña Reels
//   node programar.mjs --lista              -> muestra la cola
//   node programar.mjs --cancelar <carpeta> -> saca un reel de la cola (si todavía no salió)
//
// Si programás de nuevo con el mismo --cuando y el mismo --bot (o el mismo nombre de archivo), se reemplaza.
import fs from 'node:fs';
import path from 'node:path';
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
    const est = i.publicado ? `✅ salió ${i.publicado.permalink}` : i.error ? `❌ ${i.error}` : '⏳ en espera';
    console.log(`${d}  ·  ${i.cuando_mendoza}  ·  ${est}`);
  }
  process.exit(0);
}

if (arg('--cancelar')) {
  const dir = path.join(COLA, arg('--cancelar'));
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
  if (info.publicado) {
    console.log('Ese reel ya salió; no se puede cancelar desde acá.');
    process.exit(1);
  }
  fs.rmSync(dir, { recursive: true });
  subir(`cola: cancelado ${arg('--cancelar')}`);
  console.log('🗑️  Sacado de la cola.');
  process.exit(0);
}

const archivo = arg('--archivo');
const cuando = arg('--cuando');
if (!archivo || !cuando || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cuando)) {
  console.log('Faltan datos. Ejemplo: node programar.mjs --archivo reel.mp4 --caption-archivo caption.txt --cuando "2026-11-11 21:00"');
  process.exit(1);
}
const fecha = new Date(cuando.replace(' ', 'T') + ':00-03:00'); // Mendoza = UTC-3 todo el año
if (fecha.getTime() < Date.now() - 5 * 60 * 1000) {
  console.log(`⚠️  ${cuando} ya pasó: se va a publicar en la próxima vuelta del bot (unos minutos).`);
}
const caption = arg('--caption-archivo') ? fs.readFileSync(arg('--caption-archivo'), 'utf8').trim() : arg('--caption') ?? '';
if (!caption) console.log('⚠️  Sin caption: igual se puede, pero sin texto no hay protección contra publicar dos veces.');

const base = (arg('--bot') || path.basename(archivo, path.extname(archivo)))
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const carpeta = `${cuando.replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')}-${base}`;
const dir = path.join(COLA, carpeta);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(archivo, path.join(dir, 'video.mp4'));
const info = {
  cuando: fecha.toISOString(),
  cuando_mendoza: cuando,
  caption,
  feed: !flag('--sin-feed'),
  bot: arg('--bot') || null,
  frases: arg('--frases-archivo')
    ? fs.readFileSync(arg('--frases-archivo'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : null,
  votacion: flag('--votacion') ? ['A', 'B'] : null,
};
fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(info, null, 2) + '\n');
subir(`cola: ${carpeta}`);
console.log(`📅 Programado para ${cuando} (Mendoza): docs/cola/${carpeta}`);
console.log(`   Video: ${urlPages()}/cola/${carpeta}/video.mp4`);
