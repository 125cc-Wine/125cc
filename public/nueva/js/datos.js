// datos.js — carga de la carta, filtro de vinos listos, precio de copa y
// mapeo de los campos de /api/obtener-vinos al modelo del prototipo.
// Las funciones marcadas "copia de public/index.html" son copias, no
// movidas: la carta actual sigue usando las suyas.

import { norm } from './util.js';

/* ---------- Vocabulario (del prototipo) ---------- */
// Colores por tipo: tokens de tokens.css, para que sigan al tema.
export const TIPO = {
  Tinto:   {c: 'var(--tipo-tinto)',   ink: 'var(--on-tinto)'},
  Blanco:  {c: 'var(--tipo-blanco)',  ink: 'var(--papel-tinta)'},
  Rosado:  {c: 'var(--tipo-rosado)',  ink: 'var(--papel-tinta)'},
  Naranjo: {c: 'var(--tipo-naranjo)', ink: 'var(--papel-tinta)'}
};
export const TIPOS = ['Tinto', 'Blanco', 'Rosado', 'Naranjo'];
// La rueda de aromas: único vocabulario válido para aromas_somm y para las catas.
// color: token --aroma-* · tx: rótulo sobre ese color en la rueda (el que más
// contrasta; en especias y tierra el claro, que se lee mejor cuando la rueda
// atenúa las familias no elegidas) · paper: el sello sobre el papel del cuaderno, el mismo color
// mezclado con tinta en la proporción justa para pasar 4.5:1 en los dos temas.
const fam = (id, nombre, l, token, tx, sello, aromas) => ({id, nombre, l, aromas,
  color: 'var(' + token + ')', tx: 'var(' + tx + ')',
  paper: sello === 100 ? 'var(' + token + ')' : 'color-mix(in srgb, var(' + token + ') ' + sello + '%, var(--papel-tinta))'});
export const FAMILIAS = [
  fam('roja', 'Fruta roja', ['Fruta','roja'], '--aroma-fruta-roja', '--on-tinto', 65, ['frutilla','cereza','frambuesa','grosella']),
  fam('negra', 'Fruta negra', ['Fruta','negra'], '--aroma-fruta-negra', '--on-tinto', 100, ['mora','ciruela','cassis','arándano']),
  fam('blanca', 'Fruta blanca y cítricos', ['Fruta','blanca'], '--aroma-fruta-blanca', '--papel-tinta', 30, ['pera','manzana verde','durazno','ananá','limón','pomelo']),
  fam('floral', 'Floral', ['Floral'], '--aroma-floral', '--papel-tinta', 40, ['violeta','rosa','flores blancas','azahar']),
  fam('especiado', 'Especiado', ['Especias'], '--aroma-especiado', '--on-tinto', 50, ['pimienta','clavo','canela','nuez moscada']),
  fam('herbal', 'Herbal', ['Hierbas'], '--aroma-herbal', '--papel-tinta', 40, ['hierbas frescas','menta','pimiento verde','eucalipto']),
  fam('madera', 'Madera y tostado', ['Madera'], '--aroma-madera', '--on-tinto', 60, ['vainilla','chocolate','café','tabaco','tostado']),
  fam('terroso', 'Terroso', ['Tierra'], '--aroma-terroso', '--on-tinto', 55, ['grafito','tierra húmeda','cuero','hongos'])
];
const AROMA_FAM = {};
FAMILIAS.forEach(f => f.aromas.forEach(a => { AROMA_FAM[a] = f; }));
export const famDe = a => AROMA_FAM[a];
export const COLOR_SIN_FAMILIA = 'var(--aroma-terroso)';
export const COLORES = {
  Tinto:[['Violáceo','#4F1640'],['Rojo rubí','#8E1B2E'],['Rojo cereza','#A4162E'],['Granate','#6A1420'],['Rojo teja','#8A3A22']],
  Blanco:[['Amarillo verdoso','#D6D88A'],['Amarillo pálido','#EDE3A0'],['Amarillo dorado','#D9B44A']],
  Rosado:[['Rosa pálido','#F1C1C0'],['Salmón','#EE9C82'],['Frambuesa','#D9536B']],
  Naranjo:[['Naranja','#D9822B'],['Ámbar','#C0791E']]
};
export const colorDe = (tipo, nombre) => { const f = (COLORES[tipo] || []).find(c => c[0] === nombre); return f ? f[1] : null; };
export const QUICK = {
  Tinto:['cereza','frutilla','mora','ciruela','violeta','pimienta','vainilla','hierbas frescas'],
  Blanco:['pera','durazno','ananá','limón','flores blancas','manzana verde','hierbas frescas','pomelo'],
  Rosado:['frutilla','frambuesa','ananá','durazno','pomelo','flores blancas','hierbas frescas','limón'],
  Naranjo:['durazno','ananá','flores blancas','hierbas frescas','miel','canela','limón','tostado']
};
export const IMP = [['encanto','Me encantó',.92],['gusto','Me gustó',.55],['no','No es para mí',.16]];
export const IMP_L = {encanto:'Me encantó', gusto:'Me gustó', no:'No es para mí'};
export const PRESET = {encanto:93, gusto:87, no:74};
export const PASOS = [
  ['Fase visual','Inclina la copa sobre el mantel blanco y mirá el borde.'],
  ['Fase olfativa','Olé la copa quieta, después girala y volvé a oler.'],
  ['En boca','Un sorbo chico, que recorra toda la boca.'],
  ['Conclusión','Lo que te queda después de la copa.'],
  ['Puntuación','Del 60 al 100, sin pensarlo demasiado.']
];
// "Final" en la hoja de catas es numérico 1–5 (como en la carta actual).
export const FINAL_NUM = {Corto: 2, Medio: 3, Largo: 4};
export const finalDeNum = n => !n ? null : n <= 2 ? 'Corto' : n >= 4 ? 'Largo' : 'Medio';

// La carga de vinos usa "Naranja" o "Naranjo" según quién lo cargó; acá es uno solo.
export function normalizarTipo(t){
  const k = norm(t);
  if (k.startsWith('naranj')) return 'Naranjo';
  if (k.startsWith('blanc')) return 'Blanco';
  if (k.startsWith('rosad')) return 'Rosado';
  return 'Tinto';
}

export function regionCorta(r){ if (!r) return ''; const base = r.split('(')[0].trim(); const parts = base.split(',').map(s => s.trim()); return parts.length > 2 ? parts.slice(-2).join(', ') : base; }
export function regionKey(r){
  if (!r) return '';
  if (/Patagonia|Neuquén|Río Negro|Chubut/.test(r)) return 'Patagonia';
  if (/^Luján de Cuyo|Agrelo|Perdriel|Las Compuertas|Vistalba/.test(r)) return 'Luján de Cuyo';
  if (/Uco|Tupungato|Tunuyán|Gualtallary|Consulta|Vista Flores|Altamira|Chacayes|San Carlos/.test(r)) return 'Valle de Uco';
  if (/Maipú/.test(r)) return 'Maipú';
  if (/Salta|Cafayate|Calchaquí/.test(r)) return 'Salta';
  return r.split(',')[0].split('(')[0].trim();
}
export function preguntaSomm(w){
  if (w.altitud) return 'Preguntale al sommelier qué le aporta crecer a ' + w.altitud.replace('+', 'más de ') + '.';
  if (/sin crianza/i.test(w.crianza)) return 'Preguntale al sommelier por qué este vino no pasa por madera.';
  if (/roble|barrica/i.test(w.crianza)) return 'Preguntale al sommelier qué le suma la madera a este vino.';
  return 'Preguntale al sommelier con qué lo acompañaría esta noche.';
}

/* ---------- Precio de copa (copia de public/index.html / public/precio.js) ---------- */
// El precio de copa NUNCA se guarda: se calcula siempre desde el precio de
// góndola del Sheet. Si la fórmula cambia, cambia también en index.html,
// precio.js y api/_lib/pos/productos-import.js.
function precioBottella(p){
  if (!p) return 0;
  const clean = p.toString().replace(/\$/g, '').trim();
  const n = parseFloat(clean.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
// $10k–$13.999 → ×1.70 | $14k–$17.999 → ×1.60 | $18k–$29.999 → ×1.50 | $30k+ → ×1.25
export function calcularPrecioCopa(p){
  const botella = precioBottella(p);
  if (!botella) return 0;
  let factor = 1.50;
  if (botella < 14000)      factor = 1.70;
  else if (botella < 18000) factor = 1.60;
  else if (botella < 30000) factor = 1.50;
  else                      factor = 1.25;
  return Math.round(((botella / 6) * factor) / 500) * 500;
}

/* ---------- Vinos listos (copia de public/index.html) ---------- */
// w.numero lo calcula una sola vez api/obtener-vinos.js: ficha + quincena
// vigente del Calendario de Carta. No duplicar el chequeo acá.
export function vinoListoParaMenu(w){ return !!(w && w.numero != null); }
export function filtrarVinosListos(vinos){ return (vinos || []).filter(vinoListoParaMenu); }

/* ---------- Mapeo al modelo del prototipo ---------- */
export function mapearVino(v){
  const tipo = normalizarTipo(v.tipo);
  const colores = (COLORES[tipo] || []).map(c => c[0]);
  return {
    id: v.id,
    n: v.numero ?? null,
    nombre: v.nombre || '',
    bodega: v.bodega || '',
    tipo,
    tipoOriginal: v.tipo || tipo,
    precio: v.precio || '',
    copa: calcularPrecioCopa(v.precio),
    x: Number(v.x) || 0,
    y: Number(v.y) || 0,
    varietal: v.varietal || '',
    region: v.region || '',
    altitud: v.altitud || '',
    suelo: v.suelo || '',
    crianza: v.crianza || '',
    temperatura: v.temperatura || '',
    nota: v.nota || '',
    maridaje: Array.isArray(v.maridaje) ? v.maridaje : [],
    bodega_info: v.bodega_info || '',
    bodega_lat: v.bodega_lat ?? null,
    bodega_lon: v.bodega_lon ?? null,
    tienda: v.tienda_url || '',
    imagen: v.imagen || '',
    perfil: {cuerpo: 3, frescura: 3, taninos: 3, ...(v.perfil || {})},
    // Solo el vocabulario de la rueda; lo demás se descarta
    aromas_somm: (Array.isArray(v.aromas_somm) ? v.aromas_somm : []).map(a => norm(a)).map(a => FAMILIAS.flatMap(f => f.aromas).find(x => norm(x) === a)).filter(Boolean),
    color_somm: colores.includes(v.color_somm) ? v.color_somm : null,
  };
}

/* ---------- Estado de la carta ---------- */
export const carta = {vinos: [], todos: [], quincena: null};
export const byId = id => carta.vinos.find(w => w.id === id);
// Cualquier vino del Sheet, esté o no en la carta de hoy (para catas viejas)
export const vinoPorId = id => byId(id) || carta.todos.find(w => w.id === id);
export const vinoPorNombre = nombre => { const k = norm(nombre); return carta.vinos.find(w => norm(w.nombre) === k) || carta.todos.find(w => norm(w.nombre) === k); };

// Caché del cliente: misma clave y forma que la carta actual (vinos listos,
// tal cual vienen de la API). Acá se usa aunque tenga más de un minuto para
// abrir al instante, y se refresca enseguida en segundo plano.
const CACHE_KEY = '125cc_wines_v1';
const META_KEY = '125cc-nueva-meta';
const CACHE_MAX = 6 * 60 * 60 * 1000; // más viejo que esto puede ser otra quincena: se espera la API
function leerCache(){
  try {
    const {data, ts} = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {};
    if (!Array.isArray(data) || !data.length || Date.now() - ts > CACHE_MAX) return null;
    const meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    return {data, quincena: meta.quincena || null};
  } catch (e) { return null; }
}
function guardarCache(listos, quincena){
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({data: listos, ts: Date.now()}));
    localStorage.setItem(META_KEY, JSON.stringify({quincena}));
  } catch (e) {}
}
function aplicar(listos, todos, quincena){
  carta.vinos = listos.map(mapearVino).sort((a, b) => (a.n ?? 999) - (b.n ?? 999));
  if (todos) carta.todos = todos.map(mapearVino);
  carta.quincena = quincena || null;
}
const pedirApi = () => fetch('/api/obtener-vinos').then(r => r.ok ? r.json() : null).catch(() => null);

// Llama a alListo() apenas hay carta para mostrar (de la caché o de la API)
// y a alActualizar() si después llegan datos más nuevos. Devuelve false si
// no hubo forma de cargar nada.
export async function cargarCarta(alActualizar){
  const cache = leerCache();
  const api = pedirApi();
  if (cache) {
    aplicar(cache.data, null, cache.quincena);
    api.then(d => {
      if (!d || !Array.isArray(d.vinos) || !d.vinos.length) return;
      const listos = filtrarVinosListos(d.vinos);
      guardarCache(listos, d.quincena);
      aplicar(listos, d.vinos, d.quincena);
      alActualizar();
    });
    return true;
  }
  const d = await api;
  if (d && Array.isArray(d.vinos) && d.vinos.length) {
    const listos = filtrarVinosListos(d.vinos);
    guardarCache(listos, d.quincena);
    aplicar(listos, d.vinos, d.quincena);
    return true;
  }
  // Respaldo: el JSON estático (como la carta actual)
  try {
    const cfg = await fetch('/vinos.json').then(r => r.json());
    const listos = filtrarVinosListos(cfg.vinos);
    aplicar(listos, cfg.vinos, null);
    return listos.length > 0;
  } catch (e) { return false; }
}
