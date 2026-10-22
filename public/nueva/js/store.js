// store.js — el cuaderno: se guarda primero en el celular (localStorage,
// clave 125cc-cuaderno-v1) con una copia del vino en cada página, y si hay
// email se sincroniza con la hoja Degustaciones por los mismos endpoints que
// la carta actual (guardar-puntuacion / editar-cata / borrar-cata / stats).
// Sin conexión, la página queda pendiente y se reintenta al volver a abrir.

import { uid, vistas, norm } from './util.js';
import { vinoPorId, vinoPorNombre, normalizarTipo, FINAL_NUM, finalDeNum, IMP_L } from './datos.js';

const KEY = '125cc-cuaderno-v1';
const EMAIL_KEY = '125cc_email'; // la misma que usa "Mis catas" en la carta actual
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// pages: las páginas · borrados: catas del servidor que falta borrar (sin conexión)
export const store = {pages: [], email: '', theme: '', borrados: []};

export function save(){ try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
export function load(){
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.pages)) Object.assign(store, s);
    if (!Array.isArray(store.borrados)) store.borrados = [];
  } catch (e) {}
  if (!store.email) {
    try { const e = localStorage.getItem(EMAIL_KEY) || ''; if (EMAIL_RE.test(e)) store.email = e; } catch (e) {}
  }
}

/* ---------- Páginas ---------- */
export const snapDe = w => ({n: w.n ?? null, nombre: w.nombre, bodega: w.bodega, varietal: w.varietal, tipo: w.tipo, tipoOriginal: w.tipoOriginal || w.tipo, region: w.region, x: w.x, y: w.y, precio: w.precio, copa: w.copa, imagen: w.imagen});
export function mkPage(w, o){
  return Object.assign({
    id: uid(), vinoId: w.id ?? null, fecha: new Date().toISOString(), modo: 'rapida', impresion: null, puntaje: 86,
    color: null, intensidad: null, aromas: [], intAroma: null, perfil: null, final: null, repetiria: null, nota: '',
    serverId: null, pendiente: null,
    snap: snapDe(w)
  }, o);
}
// El vino de una página: el de la carta si sigue, o uno armado con la copia.
export function vinoDe(p){
  return (p.vinoId != null && vinoPorId(p.vinoId))
    || Object.assign({id: p.vinoId, perfil: {}, aromas_somm: [], color_somm: null, altitud: '', crianza: '', maridaje: []}, p.snap);
}
export const ultimaPagina = id => store.pages.filter(p => p.vinoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
export function ultimasPorVino(){
  const m = new Map();
  [...store.pages].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(p => m.set(p.vinoId ?? 'n:' + norm(p.snap.nombre), p));
  return [...m.values()];
}
export function paladar(){
  const liked = ultimasPorVino().filter(p => p.puntaje >= 86 && p.snap.x != null && p.snap.y != null);
  if (liked.length < 2) return null;
  return {X: liked.reduce((s, p) => s + p.snap.x, 0) / liked.length, Y: liked.reduce((s, p) => s + p.snap.y, 0) / liked.length, n: liked.length};
}
export function frasePaladar(){
  const z = paladar();
  if (!z) return 'Anotá un par de copas más y te muestro hacia dónde va tu paladar.';
  const h = z.X < -18 ? 'frescos' : z.X > 18 ? 'complejos' : null;
  const v = z.Y > 18 ? 'potentes' : z.Y < -18 ? 'suaves' : null;
  const t = h && v ? 'los vinos ' + h + ' y ' + v : h ? 'los vinos ' + h : v ? 'los vinos ' + v : 'vinos de todo el mapa, sin un lado preferido';
  return 'Te vienen gustando ' + t + '.';
}
const dayKey = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
export function ultimaNoche(pages){
  const k = dayKey(new Date(pages[0].fecha));
  const ps = pages.filter(p => dayKey(new Date(p.fecha)) === k).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {d: new Date(pages[0].fecha), pages: ps, esHoy: k === dayKey(new Date())};
}

/* ---------- Servidor ---------- */
// Mismo formato que enviarPuntuacion() de la carta actual, más los campos
// nuevos (columnas Impresion, Intensidad color, Intensidad aromatica, App).
// Lo vacío no se manda: el servidor escribe "—" como hoy.
function payload(p){
  const s = p.snap, pf = p.perfil || {};
  const b = {
    email: store.email, vino: s.nombre, bodega: s.bodega, tipo: s.tipoOriginal || s.tipo, precio: s.precio,
    nivel: p.modo === 'completa' ? 'sommelier' : 'simple',
    puntuacion: p.puntaje,
    color: p.color, aromas: (p.aromas || []).join(', '),
    acidez: pf.frescura, cuerpo: pf.cuerpo, taninos: pf.taninos, // frescura percibida va en Acidez
    final_boca: FINAL_NUM[p.final],
    repetiria: p.repetiria,
    descripcion: p.nota, opinion: p.nota,
    copa: '125 cc', varietal: s.varietal,
    impresion: p.impresion ? IMP_L[p.impresion] : null,
    intensidad_color: p.intensidad, intensidad_aromatica: p.intAroma,
    app: 'nueva',
  };
  Object.keys(b).forEach(k => { if (b[k] == null || b[k] === '') delete b[k]; });
  return b;
}
const post = (url, body) => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

const enVuelo = new Set();
async function subir(p){
  if (!store.email || enVuelo.has(p.id)) return;
  enVuelo.add(p.id);
  const editar = !!p.serverId;
  try {
    const body = payload(p);
    if (editar) body.id = p.serverId;
    const r = await post(editar ? '/api/editar-cata' : '/api/guardar-puntuacion', body);
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      if (!editar) p.serverId = d.id || null;
      p.pendiente = null;
    } else if (editar && (r.status === 404 || r.status === 403)) {
      // La cata ya no está (o es de otro email): se vuelve a crear
      p.serverId = null; p.pendiente = 'crear';
    } else if (r.status >= 400 && r.status < 500) {
      p.pendiente = null; // datos que el servidor no acepta: reintentar no lo arregla
      console.warn('Cata no aceptada por el servidor', r.status, d);
    }
  } catch (e) { /* sin conexión: queda pendiente */ }
  enVuelo.delete(p.id);
  save(); vistas.refresh();
}
function marcar(p){ if (store.email) p.pendiente = p.serverId ? 'editar' : 'crear'; }

export function guardarPagina(p){ store.pages.push(p); marcar(p); save(); subir(p); }
export function actualizarPagina(p){ marcar(p); save(); subir(p); }
export async function borrarPagina(id){
  const p = store.pages.find(x => x.id === id);
  store.pages = store.pages.filter(x => x.id !== id);
  if (p && p.serverId && store.email) { store.borrados.push({serverId: p.serverId, email: store.email}); }
  save();
  await borrarPendientes();
}
async function borrarPendientes(){
  for (const b of [...store.borrados]) {
    try {
      const r = await post('/api/borrar-cata', {id: b.serverId, email: b.email});
      if (r.ok || (r.status >= 400 && r.status < 500)) store.borrados = store.borrados.filter(x => x !== b);
    } catch (e) { break; } // sin conexión: se reintenta al volver a abrir
  }
  save();
}

// Las catas que ya tiene ese email (de la carta actual o de otro celular)
// se suman como páginas. Mismo pedido que buscarMisCatas() de hoy.
function fechaDeCata(c){
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((c.fecha || '').trim());
  if (!m) return new Date().toISOString();
  const [hh, mm] = (c.hora || '').split(':').map(n => parseInt(n, 10) || 0);
  return new Date(+m[3], +m[2] - 1, +m[1], hh || 0, mm || 0).toISOString();
}
const vacio = v => v == null || v === '' || v === '—';
const legacyKey = c => 'L:' + c.fecha + '|' + c.hora + '|' + norm(c.vino);
function paginaDeCata(c){
  const w = vinoPorNombre(c.vino);
  const completa = (c.nivel || '').toLowerCase() === 'sommelier';
  const puntaje = Number(c.puntuacion) || 80;
  const impresion = Object.keys(IMP_L).find(k => IMP_L[k] === c.impresion) || (puntaje >= 90 ? 'encanto' : puntaje >= 80 ? 'gusto' : 'no');
  const tipo = normalizarTipo(c.tipo);
  const snap = w ? snapDe(w) : {n: null, nombre: c.vino, bodega: vacio(c.bodega) ? '' : c.bodega, varietal: vacio(c.varietal) ? '' : c.varietal, tipo, tipoOriginal: c.tipo, region: '', x: null, y: null, precio: vacio(c.precio) ? '' : c.precio, imagen: ''};
  const perfil = completa && (c.cuerpo || c.acidez || c.taninos)
    ? {cuerpo: c.cuerpo || null, frescura: c.acidez || null, taninos: c.taninos || null} : null;
  return {
    id: uid(), vinoId: w ? w.id : null, fecha: fechaDeCata(c), modo: completa ? 'completa' : 'rapida', impresion, puntaje,
    color: vacio(c.color) ? null : c.color, intensidad: c.intensidad_color || null,
    aromas: vacio(c.aromas) ? [] : c.aromas.split(',').map(a => a.trim().toLowerCase()).filter(Boolean),
    intAroma: c.intensidad_aromatica || null, perfil,
    final: completa ? finalDeNum(c.final_boca) : null,
    repetiria: vacio(c.repetiria) ? null : c.repetiria,
    nota: vacio(c.descripcion) ? '' : c.descripcion,
    serverId: c.id || null, serverKey: c.id ? null : legacyKey(c), pendiente: null, snap
  };
}
async function importar(){
  if (!store.email) return 0;
  try {
    const r = await post('/api/stats', {email: store.email});
    if (!r.ok) return 0;
    const catas = (await r.json()).catas || [];
    const ids = new Set(store.pages.map(p => p.serverId).filter(Boolean).concat(store.borrados.map(b => b.serverId)));
    const keys = new Set(store.pages.map(p => p.serverKey).filter(Boolean));
    let n = 0;
    catas.forEach(c => {
      if (c.id ? ids.has(c.id) : keys.has(legacyKey(c))) return;
      store.pages.push(paginaDeCata(c)); n++;
    });
    if (n) save();
    return n;
  } catch (e) { return 0; }
}

// Al abrir la app y al dejar el email: reintentar lo pendiente y traer lo nuevo.
export async function sincronizar(){
  if (!store.email) return 0;
  await borrarPendientes();
  await Promise.all(store.pages.filter(p => p.pendiente).map(subir));
  const n = await importar();
  vistas.refresh();
  return n;
}
export async function setEmail(email){
  store.email = email;
  try { localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
  // Lo anotado antes de dejar el email también se sube
  store.pages.forEach(p => { if (!p.serverId) p.pendiente = 'crear'; });
  save();
  return sincronizar();
}
export function olvidarEmail(){
  store.email = '';
  try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}
  store.pages.forEach(p => { p.pendiente = null; });
  save();
}
