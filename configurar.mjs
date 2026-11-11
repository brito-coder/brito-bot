// brito-bot · configuración inicial (se corre una sola vez, o cuando cambie el token).
//
// Uso: node configurar.mjs   y pegá el token largo cuando lo pida.
//
// Con el token de USUARIO de larga duración busca la página «Brito», saca su token de página
// (ese no vence mientras no cambies la contraseña ni quites permisos) y el id de @brito.redes.
// Lo guarda en .env (solo en esta Mac) y en los "secrets" de GitHub, para que el bot corra solo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { graph, RAIZ } from './lib/graph.mjs';

// La llave no se muestra en pantalla mientras la pegás (como una contraseña): se ven puntitos.
function leerOculto(pregunta) {
  return new Promise((resolve) => {
    process.stdout.write(pregunta);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let t = '';
      stdin.on('data', (d) => (t += d)).on('end', () => resolve(t));
      return;
    }
    let texto = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const alRecibir = (d) => {
      for (const ch of d) {
        if (ch === '\r' || ch === '\n') {
          if (!texto.trim()) continue; // Enter sin nada pegado: sigue esperando
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', alRecibir);
          process.stdout.write(`\n(recibido: ${texto.trim().length} caracteres)\n`);
          return resolve(texto);
        }
        if (ch === '\u0003') process.exit(1); // Ctrl-C
        if (ch === '\u007f') { texto = texto.slice(0, -1); continue; }
        texto += ch;
        if (texto.length % 10 === 0) process.stdout.write('•');
      }
    };
    stdin.on('data', alRecibir);
  });
}
const userToken = (process.env.TOKEN_USUARIO || (await leerOculto('Pegá el token largo (se ven solo puntitos) y apretá Enter: '))).trim();
if (!userToken.startsWith('EAA')) {
  console.log('❌ Eso no parece una llave de Meta (tiene que empezar con EAA). Copiala de nuevo y volvé a correr: node configurar.mjs');
  process.exit(1);
}

const dbg = await graph('GET', 'debug_token', { input_token: userToken }, userToken);
const vence = dbg.data?.expires_at ? new Date(dbg.data.expires_at * 1000) : null;
console.log(`Token válido: ${dbg.data?.is_valid ? 'sí' : 'NO'} · vence: ${vence && vence.getTime() > 0 ? vence.toLocaleDateString('es-AR') : 'nunca'}`);
console.log(`Permisos: ${(dbg.data?.scopes || []).join(', ')}`);

const paginas = await graph(
  'GET',
  'me/accounts',
  { fields: 'id,name,access_token,instagram_business_account{id,username}' },
  userToken,
);
const pagina =
  paginas.data.find((p) => p.instagram_business_account?.username === 'brito.redes') ||
  paginas.data.find((p) => /brito/i.test(p.name) && p.instagram_business_account);
if (!pagina) {
  console.log('❌ No encontré la página «Brito» conectada a @brito.redes. Páginas que veo:');
  for (const p of paginas.data) console.log(`   - ${p.name} (Instagram: ${p.instagram_business_account?.username || 'ninguno'})`);
  process.exit(1);
}
const igId = pagina.instagram_business_account.id;
const pageToken = pagina.access_token;
const dbgPag = await graph('GET', 'debug_token', { input_token: pageToken }, pageToken);
const vencePag = dbgPag.data?.expires_at;
console.log(`✅ Página: ${pagina.name} · Instagram: @${pagina.instagram_business_account.username} (${igId})`);
console.log(`   Token de página vence: ${vencePag ? new Date(vencePag * 1000).toLocaleDateString('es-AR') : 'nunca'}`);

fs.writeFileSync(path.join(RAIZ, '.env'), `IG_TOKEN=${pageToken}\nIG_USER_ID=${igId}\nFB_PAGE_ID=${pagina.id}\n`, { mode: 0o600 });
console.log('   Guardado en .env (solo en esta Mac, no se sube a GitHub).');

try {
  execFileSync('gh', ['secret', 'set', 'IG_TOKEN', '--body', pageToken], { cwd: RAIZ, stdio: 'ignore' });
  execFileSync('gh', ['secret', 'set', 'IG_USER_ID', '--body', igId], { cwd: RAIZ, stdio: 'ignore' });
  execFileSync('gh', ['secret', 'set', 'FB_PAGE_ID', '--body', pagina.id], { cwd: RAIZ, stdio: 'ignore' });
  console.log('   Guardado también en GitHub (secrets IG_TOKEN, IG_USER_ID y FB_PAGE_ID).');
} catch {
  console.log('   (No pude guardarlo en GitHub; Claude lo hace después.)');
}
