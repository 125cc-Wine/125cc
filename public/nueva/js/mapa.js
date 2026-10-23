// mapa.js — la vista Carta (mapa + lista) y el mapa del vino: cada copa ubicada por carácter (Fresco ↔
// Complejo, Suave ↔ Potente). x/y ya vienen calculados por
// api/obtener-vinos.js desde perfil_* y crianza; acá solo se reparten en
// pantalla y se apartan las copitas que quedarían encimadas.

import { $, ui, esc, fmt$, cap, quincena, ACT, haptic } from './util.js';
import { carta, TIPO, TIPOS, regionCorta, byId } from './datos.js';
import { copita, GLASS_ICON, ICON_GO } from './dibujos.js';
import { nicho } from './imagenes.js';
import { ultimaPagina, paladar } from './store.js';

// Dónde pueden caer las copitas (fracción del mapa): arriba y abajo queda
// libre la franja de las palabras de los ejes y de los cuadrantes.
const X0 = .08, X1 = .92, Y0 = .2, Y1 = .84;
const entre = (v, a, b) => Math.min(b, Math.max(a, v));
const enMapa = (x, y) => ({x: X0 + entre((x + 100) / 200, 0, 1) * (X1 - X0), y: Y0 + entre((100 - y) / 200, 0, 1) * (Y1 - Y0)});
let LAYOUT = {};
export function calcularLayout(){
  const sx = 0.075, sy = 0.105;
  const pts = carta.vinos.map(w => Object.assign({id: w.id}, enMapa(w.x, w.y)));
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      let dx = (b.x - a.x) / sx, dy = (b.y - a.y) / sy;
      const d = Math.hypot(dx, dy);
      if (d < 1) {
        if (d === 0) { dx = 1; dy = 0; }
        const ux = dx / (d || 1), uy = dy / (d || 1), push = (1 - d) / 2;
        a.x -= ux * push * sx; b.x += ux * push * sx; a.y -= uy * push * sy; b.y += uy * push * sy;
      }
    }
    // Adentro del área en cada vuelta, así las que chocan contra un borde se abren hacia el otro lado
    pts.forEach(p => { p.x = entre(p.x, X0, X1); p.y = entre(p.y, Y0, Y1); });
  }
  const o = {};
  pts.forEach(p => { o[p.id] = {x: entre(p.x, X0, X1), y: entre(p.y, Y0, Y1)}; });
  LAYOUT = o;
}

export const visible = w => (ui.filtro === 'Todos' || w.tipo === ui.filtro) && (!ui.faltan || !ultimaPagina(w.id));

export function mapHTML(o){
  o = o || {};
  let zona = '';
  if (o.paladar) {
    const z = paladar();
    if (z) { const c = enMapa(z.X, z.Y); zona = '<div class="zona" style="left:' + (c.x * 100).toFixed(1) + '%;top:' + (c.y * 100).toFixed(1) + '%"><span>Tu zona</span></div>'; }
  }
  // Marcas cada 25 % sobre los ejes (los ejes van de 5 % a 95 % y de 7 % a 93 %)
  const marcas = [0, .25, .5, .75, 1].map(f => '<i class="mk mk-x" style="left:' + (5 + f * 90) + '%"></i><i class="mk mk-y" style="top:' + (7 + f * 86) + '%"></i>').join('');
  return '<div class="map' + (o.big ? ' big' : '') + '" role="group" aria-label="Mapa del vino: de fresco a complejo y de suave a potente">'
    + '<i class="cuad cuad-fp"></i><i class="cuad cuad-cp"></i><i class="cuad cuad-fs"></i><i class="cuad cuad-cs"></i>'
    + '<i class="ax ax-x"></i><i class="ax ax-y"></i>' + marcas
    + '<span class="lb lb-t">Potente</span><span class="lb lb-b">Suave</span><span class="lb lb-l">Fresco</span><span class="lb lb-r">Complejo</span>'
    + '<span class="lq lq-fp">Fresco y con cuerpo</span><span class="lq lq-cp">Potente y complejo</span><span class="lq lq-fs">Fresco y liviano</span><span class="lq lq-cs">Suave y complejo</span>'
    + zona
    + carta.vinos.map(w => {
      const p = LAYOUT[w.id], pg = ultimaPagina(w.id);
      if (!p) return '';
      const dim = o.paladar ? !pg : !visible(w);
      return '<button class="pin' + (dim ? ' dim' : '') + '" style="left:' + (p.x * 100).toFixed(2) + '%;top:' + (p.y * 100).toFixed(2) + '%" data-act="pin" data-id="' + w.id + '" aria-label="Nº ' + w.n + ', ' + esc(w.nombre) + (pg ? ', anotado con ' + pg.puntaje : '') + '">' + copita(w) + (pg ? '<span class="sb">' + pg.puntaje + '</span>' : '') + '</button>';
    }).join('')
    + '</div>';
}

/* ---------- Burbuja del mapa ---------- */
// El primer toque en una copita muestra la botella, el nombre y el precio;
// el segundo (o tocar la burbuja) abre la página del vino.
let burbuja = null; // {id, el, pin}
function cerrarBurbuja(){
  if (!burbuja) return;
  burbuja.el.remove(); burbuja.pin.classList.remove('sel'); burbuja.pin.closest('.map')?.classList.remove('con-burbuja');
  burbuja = null;
}
function abrirBurbuja(pin, w){
  cerrarBurbuja();
  const map = pin.closest('.map');
  const el = document.createElement('button');
  el.className = 'burbuja';
  el.dataset.act = 'ficha'; el.dataset.id = w.id;
  el.innerHTML = nicho(w, {sizes: '48px', width: 33, height: 48, lazy: false})
    + '<span class="bu-main"><span class="bu-name">' + esc(w.nombre) + '</span><span class="bu-meta">' + esc(w.bodega) + '</span><span class="t-precio">' + fmt$(w.copa) + '</span></span>'
    + '<span class="bu-go">' + ICON_GO + '</span>';
  map.appendChild(el);
  // Arriba de la copita si está en la mitad de abajo; si no, debajo. Siempre adentro del mapa.
  const mw = map.clientWidth, mh = map.clientHeight, bw = el.offsetWidth, bh = el.offsetHeight;
  const px = parseFloat(pin.style.left) / 100 * mw, py = parseFloat(pin.style.top) / 100 * mh;
  const arriba = py > mh / 2;
  const left = Math.min(mw - bw - 8, Math.max(8, px - bw / 2));
  const top = arriba ? py - 22 - 8 - bh : py + 18 + 8; // la copita ocupa de py-22 a py+18
  el.style.left = left + 'px';
  el.style.top = Math.min(mh - bh - 6, Math.max(6, top)) + 'px';
  el.style.setProperty('--flecha', Math.min(bw - 16, Math.max(16, px - left)) + 'px');
  el.classList.toggle('arriba', arriba);
  pin.classList.add('sel'); map.classList.add('con-burbuja');
  requestAnimationFrame(() => el.classList.add('show'));
  burbuja = {id: w.id, el, pin};
}
// Tocar afuera de la copita y de la burbuja la cierra
document.addEventListener('click', e => { if (burbuja && !e.target.closest('.pin, .burbuja')) cerrarBurbuja(); });

/* ---------- Vista Carta ---------- */
function rowHTML(w){
  const p = ultimaPagina(w.id);
  return '<li><button class="row" data-act="ficha" data-id="' + w.id + '">'
    + nicho(w)
    + '<span class="row-main"><span class="row-name">' + esc(w.nombre) + '</span><span class="row-meta">' + esc([w.varietal, regionCorta(w.region)].filter(Boolean).join(' · ')) + '</span></span>'
    + '<span class="row-side"><span class="t-precio">' + fmt$(w.copa) + '</span>' + (p ? '<span class="row-tag">' + p.puntaje + ' · anotado</span>' : '<span class="row-sub">la copa</span>') + '</span>'
    + '</button></li>';
}
// La quincena que muestra la API (puede ser la próxima, antes de abrir)
function fechaQuincena(){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(carta.quincena || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}
export const tiposEnCarta = () => TIPOS.filter(t => carta.vinos.some(w => w.tipo === t));
export function renderCarta(){
  const el = $('#view-carta');
  burbuja = null; // la burbuja se va con el mapa que se redibuja
  if (!ui.cargada) return; // sigue el "Sirviendo la carta…" del HTML
  if (!carta.vinos.length) {
    el.innerHTML = '<div class="carga">' + GLASS_ICON + '<p>No pudimos traer la carta.<br>Revisá la conexión y probá de nuevo.</p><button class="t-boton btn btn-primary" data-act="recargar">Reintentar</button></div>';
    return;
  }
  const tipos = ['Todos'].concat(tiposEnCarta());
  const vis = carta.vinos.filter(visible);
  el.innerHTML =
    '<div class="carta-head"><div><p class="t-eyebrow eyebrow">' + cap(quincena(fechaQuincena())) + '</p><h1 class="t-titulo-xl titulo">Carta por copa</h1></div>'
    + '<p class="carta-count">' + carta.vinos.length + ' vinos<span>copas de 125 cc</span></p></div>'
    + '<div class="mapcard">' + mapHTML() + '<div class="map-foot"><span>Tocá una copita para ver el vino</span><button class="link" data-act="ampliar">Ampliar mapa</button></div></div>'
    + '<div class="chips" role="group" aria-label="Filtrar la carta">'
    + tipos.map(t => '<button class="chip" data-act="filtro" data-v="' + t + '" aria-pressed="' + (ui.filtro === t) + '">' + (t !== 'Todos' ? '<i class="dot" style="background:' + TIPO[t].c + '"></i>' : '') + t + '</button>').join('')
    + '<button class="chip" data-act="faltan" aria-pressed="' + ui.faltan + '">Me falta probar</button></div>'
    + '<ul class="winelist">' + (vis.map(rowHTML).join('') || '<li class="empty-row">Ya probaste todos los vinos de este filtro.</li>') + '</ul>'
    + '<p class="pie"><a href="https://instagram.com/125ccwinebar" target="_blank" rel="noopener">@125ccwinebar</a> · Mar del Plata</p>';
}

Object.assign(ACT, {
  pin: (t, v, id) => {
    const w = byId(+id);
    if (!w) return;
    if (burbuja && burbuja.pin === t) { cerrarBurbuja(); ACT.ficha(t, v, id); return; }
    abrirBurbuja(t, w); haptic();
  },
  filtro: (t, v) => { ui.filtro = v; renderCarta(); haptic(); },
  faltan: () => { ui.faltan = !ui.faltan; renderCarta(); haptic(); },
  recargar: () => location.reload(),
});
