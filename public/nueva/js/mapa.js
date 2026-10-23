// mapa.js — la vista Carta (mapa + lista) y el mapa del vino: cada copa ubicada por carácter (Fresco ↔
// Complejo, Suave ↔ Potente). x/y ya vienen calculados por
// api/obtener-vinos.js desde perfil_* y crianza; acá solo se reparten en
// pantalla y se apartan las copitas que quedarían encimadas.

import { $, ui, esc, fmt$, cap, quincena, ACT, haptic } from './util.js';
import { carta, TIPO, TIPOS, regionCorta } from './datos.js';
import { copita, GLASS_ICON } from './dibujos.js';
import { ultimaPagina, paladar } from './store.js';

let LAYOUT = {};
export function calcularLayout(){
  const R = 125, sx = 0.075, sy = 0.105;
  const pts = carta.vinos.map(w => ({id: w.id, x: (w.x + R) / (2 * R), y: 1 - (w.y + R) / (2 * R)}));
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
  }
  const o = {};
  pts.forEach(p => { o[p.id] = {x: Math.min(.92, Math.max(.08, p.x)), y: Math.min(.9, Math.max(.1, p.y))}; });
  LAYOUT = o;
}

export const visible = w => (ui.filtro === 'Todos' || w.tipo === ui.filtro) && (!ui.faltan || !ultimaPagina(w.id));

export function mapHTML(o){
  o = o || {};
  let zona = '';
  if (o.paladar) {
    const z = paladar();
    if (z) zona = '<div class="zona" style="left:' + ((z.X + 125) / 250 * 100).toFixed(1) + '%;top:' + ((1 - (z.Y + 125) / 250) * 100).toFixed(1) + '%"><span>Tu zona</span></div>';
  }
  return '<div class="map' + (o.big ? ' big' : '') + '" role="group" aria-label="Mapa del vino: de fresco a complejo y de suave a potente">'
    + '<i class="ax ax-x"></i><i class="ax ax-y"></i>'
    + '<span class="lb lb-t">Potente</span><span class="lb lb-b">Suave</span><span class="lb lb-l">Fresco</span><span class="lb lb-r">Complejo</span>'
    + zona
    + carta.vinos.map(w => {
      const p = LAYOUT[w.id], pg = ultimaPagina(w.id);
      if (!p) return '';
      const dim = o.paladar ? !pg : !visible(w);
      return '<button class="pin' + (dim ? ' dim' : '') + '" style="left:' + (p.x * 100).toFixed(2) + '%;top:' + (p.y * 100).toFixed(2) + '%" data-act="ficha" data-id="' + w.id + '" aria-label="Nº ' + w.n + ', ' + esc(w.nombre) + (pg ? ', anotado con ' + pg.puntaje : '') + '">' + copita(w) + (pg ? '<span class="sb">' + pg.puntaje + '</span>' : '') + '</button>';
    }).join('')
    + '</div>';
}

/* ---------- Vista Carta ---------- */
function rowHTML(w){
  const p = ultimaPagina(w.id), t = TIPO[w.tipo];
  return '<li><button class="row" data-act="ficha" data-id="' + w.id + '">'
    + '<span class="num" style="background:' + t.c + ';color:' + t.ink + '">' + w.n + '</span>'
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
    + '<ul class="winelist">' + (vis.map(rowHTML).join('') || '<li class="empty-row">Ya probaste todos los vinos de este filtro.</li>') + '</ul>';
}

Object.assign(ACT, {
  filtro: (t, v) => { ui.filtro = v; renderCarta(); haptic(); },
  faltan: () => { ui.faltan = !ui.faltan; renderCarta(); haptic(); },
  recargar: () => location.reload(),
});
