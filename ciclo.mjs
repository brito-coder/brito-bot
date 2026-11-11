// brito-bot · vuelta completa del bot, repetida cada 5 minutos durante ~55 minutos.
// GitHub solo arranca el bot más o menos una vez por hora (aunque se le pida cada 5 min),
// así que cada arranque se queda trabajando casi una hora.
//   node ciclo.mjs          -> una sola vuelta
//   node ciclo.mjs --loop   -> vueltas cada 5 min hasta completar ~55 min
import { execFileSync } from 'node:child_process';
import { RAIZ } from './lib/graph.mjs';

const PASOS = ['cola.mjs', 'clientes.mjs', 'comentarios.mjs', 'votos.mjs', 'facebook.mjs'];
const LOOP = process.argv.includes('--loop');
const inicio = Date.now();
const DURACION = 55 * 60 * 1000;
const CADA = 5 * 60 * 1000;
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', ...opts });

function guardar() {
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    sh('git', ['add', 'estado', 'config', 'docs/cola']);
    try {
      sh('git', ['diff', '--cached', '--quiet']);
      return; // nada nuevo
    } catch { /* hay cambios */ }
    sh('git', ['commit', '-q', '-m', 'bot: registro, votos y cola']);
    for (let i = 0; i < 3; i++) {
      try {
        sh('git', ['pull', '--rebase', '--autostash', '--quiet']);
        sh('git', ['push', '--quiet']);
        return;
      } catch { /* reintento */ }
    }
  } catch (e) {
    console.log(`⚠️  No pude guardar el registro: ${e.message}`);
  }
}

let vuelta = 0;
do {
  const t0 = Date.now();
  vuelta++;
  console.log(`\n===== Vuelta ${vuelta} · ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' })} =====`);
  if (process.env.GITHUB_ACTIONS) {
    try { sh('git', ['pull', '--rebase', '--autostash', '--quiet']); } catch { /* sigo igual */ }
  }
  for (const p of PASOS) {
    try {
      sh('node', [p]);
    } catch {
      console.log(`⚠️  ${p} falló en esta vuelta; sigo con lo demás.`);
    }
  }
  guardar();
  const espera = CADA - (Date.now() - t0);
  if (!LOOP || Date.now() - inicio + Math.max(espera, 0) > DURACION) break;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
} while (true);
