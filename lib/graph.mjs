// Cliente mínimo de la Graph API de Meta (Instagram con login de Facebook).
// Sin dependencias: usa el fetch que ya trae Node 18+.
// IMPORTANTE: este bot NUNCA usa endpoints de mensajes directos (DM).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.GRAPH_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

// Lee .env (si existe) sin pisar variables que ya vengan del entorno (GitHub Actions).
export function cargarEnv() {
  const archivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function credenciales() {
  cargarEnv();
  const token = process.env.IG_TOKEN;
  const igId = process.env.IG_USER_ID;
  if (!token || !igId) {
    throw new Error('Faltan IG_TOKEN o IG_USER_ID. Corré primero: node configurar.mjs');
  }
  return { token, igId };
}

export async function graph(metodo, ruta, params = {}, token) {
  const url = new URL(ruta.startsWith('http') ? ruta : `${BASE}/${ruta.replace(/^\//, '')}`);
  const cuerpo = new URLSearchParams();
  const destino = metodo === 'GET' ? url.searchParams : cuerpo;
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) destino.set(k, String(v));
  if (token && !url.searchParams.has('access_token')) destino.set('access_token', token);
  const res = await fetch(url, metodo === 'GET' ? {} : { method: metodo, body: cuerpo });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const err = new Error(`Graph API ${res.status}: ${e.message || res.statusText} (code ${e.code ?? '?'}${e.error_subcode ? '/' + e.error_subcode : ''})`);
    err.codigo = e.code;
    err.data = data;
    throw err;
  }
  return data;
}

// Recorre todas las páginas de un listado.
export async function todo(ruta, params, token, maxPaginas = 20) {
  const items = [];
  let data = await graph('GET', ruta, params, token);
  for (let i = 0; ; i++) {
    items.push(...(data.data || []));
    const next = data.paging?.next;
    if (!next || i >= maxPaginas) break;
    data = await graph('GET', next, {}, null);
  }
  return items;
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function leerJSON(rel, porDefecto) {
  const f = path.join(RAIZ, rel);
  if (!fs.existsSync(f)) return porDefecto;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function escribirJSON(rel, datos) {
  const f = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(datos, null, 2) + '\n');
}

// Saca el "shortcode" de un link de reel: instagram.com/reel/ABC123/ -> ABC123
export function shortcodeDe(link) {
  const m = String(link).match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
