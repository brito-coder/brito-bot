// brito-bot · aviso de posibles clientes.
// Mira los comentarios de los últimos posts. Si alguien escribe "precio", "info", "me interesa",
// la palabra clave de un reel de venta, etc.:
//   1) le responde en PÚBLICO "¡Te escribo por privado!" (el bot NO manda el privado: lo hacés vos)
//   2) te avisa por mail (abre un "issue" en GitHub con el nombre, el comentario y el link).
import { credenciales, graph, todo, esperar, leerJSON, escribirJSON, shortcodeDe } from './lib/graph.mjs';

const PRUEBA = process.argv.includes('--prueba');
const { token, igId } = credenciales();
const config = leerJSON('config/reels.json', {});
const cfg = config.clientes;
if (!cfg?.activo) {
  console.log('Clientes: apagado en config/reels.json');
  process.exit(0);
}
const estado = leerJSON('estado/clientes.json', { rotacion: 0, vistos: {}, clientes: [] });
const yo = (await graph('GET', igId, { fields: 'username' }, token)).username.toLowerCase();
const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

// Palabras clave por reel (ej. "ABIERTO" en un reel de venta)
const clavesPorShortcode = {};
for (const r of config.reels || []) if (r.palabra_clave) clavesPorShortcode[shortcodeDe(r.link)] = [].concat(r.palabra_clave);

const medios = (await graph('GET', `${igId}/media`, { fields: 'id,shortcode,permalink,caption,timestamp', limit: cfg.ultimos_posts ?? 12 }, token)).data;
const nuevos = [];
for (const m of medios) {
  const palabras = [...(cfg.palabras || []), ...(clavesPorShortcode[m.shortcode] || [])].map((p) => norm(p));
  const comentarios = await todo(`${m.id}/comments`, { fields: 'id,text,username,timestamp,replies{username}', limit: 50 }, token, 5);
  for (const c of comentarios) {
    if (estado.vistos[c.id] || c.username?.toLowerCase() === yo) continue;
    const t = norm(c.text);
    const palabra = palabras.find((p) => t.includes(p));
    if (!palabra) continue;
    const yaRespondido = (c.replies?.data || []).some((r) => r.username?.toLowerCase() === yo);
    const cliente = { usuario: c.username, comentario: c.text, palabra: palabra.trim(), post: m.permalink, fecha: c.timestamp };
    if (PRUEBA) {
      console.log(`[prueba] 🔔 @${c.username}: "${c.text}" (${palabra.trim()}) en ${m.permalink}${yaRespondido ? ' — ya respondido' : ''}`);
      continue;
    }
    if (!yaRespondido) {
      const frase = cfg.frases[estado.rotacion++ % cfg.frases.length].replaceAll('{usuario}', '@' + c.username);
      try {
        await graph('POST', `${c.id}/replies`, { message: frase }, token);
        console.log(`✅ @${c.username} -> "${frase}"`);
        await esperar(4000 + Math.random() * 4000);
      } catch (e) {
        console.log(`❌ @${c.username}: ${e.message}`);
        if ([4, 17, 32, 613, 368].includes(e.codigo)) break;
        continue;
      }
    }
    estado.vistos[c.id] = new Date().toISOString();
    estado.clientes.push(cliente);
    if (!yaRespondido) nuevos.push(cliente);
  }
}
if (!PRUEBA) escribirJSON('estado/clientes.json', estado);
console.log(`Clientes: ${nuevos.length} nuevo(s).`);

// Aviso por mail: un issue en GitHub (solo dentro de GitHub Actions)
if (nuevos.length && process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY) {
  const cuerpo = [
    'El bot ya les respondió en público que les escribís por privado. **Escribiles vos por DM** 👇',
    '',
    ...nuevos.map((c) => `- **[@${c.usuario}](https://www.instagram.com/${c.usuario}/)** comentó «${c.comentario}» en [este post](${c.post})`),
  ].join('\n');
  const titulo = nuevos.length === 1 ? `🔔 Posible cliente: @${nuevos[0].usuario}` : `🔔 ${nuevos.length} posibles clientes`;
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ title: titulo, body: cuerpo, labels: ['cliente'] }),
  });
  console.log(res.ok ? '📧 Aviso enviado (issue en GitHub).' : `⚠️  No pude crear el aviso: ${res.status}`);
}
