// ficha.js — la página del vino (hoja que sube al tocar una copita o una
// fila de la carta), el mapa ampliado y el mapa del terruño de la bodega.

import { $, ui, esc, fmt$, cap, fechaLarga, reduced, ACT, haptic, registrar } from './util.js';
import { byId, TIPO, preguntaSomm } from './datos.js';
import { ICON_ASK, ICONOS_DATO, dots } from './dibujos.js';
import { escenaBotella } from './imagenes.js';
import { mapHTML, tiposEnCarta } from './mapa.js';
import { ultimaPagina } from './store.js';
import { MODOS, MODOS_DESPUES, openSheet, sBody, alCerrar } from './hoja.js';

// Cada barra con sus dos extremos
const PERFIL = [['cuerpo', 'Cuerpo', 'Liviano', 'Potente'], ['frescura', 'Frescura', 'Suave', 'Vibrante'], ['taninos', 'Taninos', 'Sedosos', 'Firmes']];
function perfilRows(perfil){
  return '<div class="perf" id="perf">' + PERFIL.map(([k, l, a, b]) => '<span class="perf-k">' + l + '</span><span class="perf-v">' + dots(perfil[k]) + '<span class="perf-ext"><span>' + a + '</span><span>' + b + '</span></span></span>').join('') + '</div>';
}
// Las barras se llenan en cascada cuando el bloque entra en pantalla
let perfIO = null;
function observarPerfil(){
  if (perfIO) { perfIO.disconnect(); perfIO = null; }
  const el = $('#perf');
  if (!el || reduced() || typeof IntersectionObserver === 'undefined') return;
  el.classList.add('esperando');
  perfIO = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    el.classList.remove('esperando'); perfIO.disconnect(); perfIO = null;
  }, {root: sBody, threshold: .6});
  perfIO.observe(el);
}
alCerrar(() => { if (perfIO) { perfIO.disconnect(); perfIO = null; } });
const coord = v => v != null && v !== '' && Number.isFinite(Number(v));
const tieneTerruno = w => coord(w.bodega_lat) && coord(w.bodega_lon);

function fichaHTML(w){
  const p = ultimaPagina(w.id);
  const groups = [
    ['Terruño', [['Región', w.region], ['Altitud', w.altitud], ['Suelo', w.suelo]]],
    ['Elaboración', [['Varietal', w.varietal], ['Crianza', w.crianza]]],
    ['Servicio', [['Temperatura', w.temperatura], ['Copa', '125 cc']]]
  ].map(([g, rows]) => [g, rows.filter(r => r[1])]).filter(([, rows]) => rows.length);
  const terruno = tieneTerruno(w);
  return '<div class="fh">' + escenaBotella(w, {ws: [320, 640], sizes: '320px', width: 213, height: 320})
    + '<div class="fh-txt"><p class="t-eyebrow eyebrow">Nº ' + w.n + ' · ' + w.tipo + '</p><h2 class="t-titulo-l titulo" id="sheet-title">' + esc(w.nombre) + '</h2><p class="fh-bodega">' + esc(w.bodega) + '</p><p class="fh-price"><strong>' + fmt$(w.copa) + '</strong>la copa de 125 cc</p></div></div>'
    + (p ? '<button class="mine" data-act="pagina" data-id="' + p.id + '"><span class="mine-score">' + p.puntaje + '</span><span><strong>Ya está en tu cuaderno</strong><br>' + cap(fechaLarga(new Date(p.fecha))) + (p.nota ? ' · “' + esc(p.nota.length > 46 ? p.nota.slice(0, 44) + '…' : p.nota) + '”' : '') + '</span></button>' : '')
    + (w.nota ? '<figure class="nota-somm"><p class="t-eyebrow eyebrow">La nota del somm</p><blockquote class="t-nota-somm">' + esc(w.nota) + '</blockquote></figure>' : '')
    + '<div class="block"><p class="block-t">Perfil <span>según la bodega</span></p>' + perfilRows(w.perfil) + '</div>'
    + groups.map(([g, rows]) => '<div class="block"><p class="block-t">' + g + '</p><dl class="facts">' + rows.map(([k, v]) => '<div><dt>' + (ICONOS_DATO[k] || '') + k + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl></div>').join('')
    + (w.maridaje.length ? '<div class="block"><p class="block-t">Va bien con</p><div class="tags">' + w.maridaje.map(m => '<span class="tag">' + esc(m) + '</span>').join('') + '</div></div>' : '')
    + (w.bodega_info || terruno ? '<div class="block bodega"><p class="block-t">Sobre la bodega</p>' + (w.bodega_info ? '<p class="bodega-txt">' + esc(w.bodega_info) + '</p>' : '')
      + (terruno ? '<div class="terruno" id="terruno" data-id="' + w.id + '"><button class="link" data-act="terruno">Ver en el mapa</button></div><p class="terruno-pie">' + esc(w.bodega) + (w.region ? ' · ' + esc(w.region) : '') + '</p>' : '') + '</div>' : '')
    + '<p class="ask">' + ICON_ASK + '<span>' + esc(preguntaSomm(w)) + '</span></p>'
    + '<div class="ficha-links">' + (w.tienda ? '<a class="tienda" href="' + esc(w.tienda) + '" target="_blank" rel="noopener">Ver la botella en la tienda de Aroma de Vid ↗</a>' : '<span></span>')
    + '<button class="link" data-act="compartir" data-id="' + w.id + '" id="compartir-l">Compartir</button></div>';
}

/* ---------- Mapa del terruño (copia de ensureLeafletLoaded / renderBodegaMapa de public/index.html) ---------- */
// Leaflet pesa: se carga recién cuando el bloque "Sobre la bodega" se ve o
// cuando la persona toca "Ver en el mapa", nunca al abrir la carta.
let leafletLoadPromise = null;
function ensureLeafletLoaded(){
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    script.onerror = () => { leafletLoadPromise = null; reject(); };
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}
let bodegaMapaInstance = null, terrunoIO = null;
function limpiarTerruno(){
  if (terrunoIO) { terrunoIO.disconnect(); terrunoIO = null; }
  if (bodegaMapaInstance) { bodegaMapaInstance.remove(); bodegaMapaInstance = null; }
}
function renderBodegaMapa(w){
  const lat = Number(w.bodega_lat), lon = Number(w.bodega_lon);
  const el = $('#terruno');
  if (!el || el.dataset.cargado) return;
  el.dataset.cargado = '1';
  if (terrunoIO) { terrunoIO.disconnect(); terrunoIO = null; }
  ensureLeafletLoaded().then(() => {
    // La persona puede haber cambiado de vino mientras cargaba Leaflet
    if (!ui.sheet || ui.sheet.mode !== 'ficha' || ui.sheet.id !== w.id || !el.isConnected) return;
    if (bodegaMapaInstance) { bodegaMapaInstance.remove(); bodegaMapaInstance = null; }
    el.innerHTML = '';
    const mapa = L.map(el, { attributionControl: true, zoomControl: false, scrollWheelZoom: false }).setView([lat, lon], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
      attribution: 'Mapa base <a href="https://www.ign.gob.ar" target="_blank">IGN</a> + <a href="https://www.osm.org/copyright" target="_blank">OpenStreetMap</a>',
      minZoom: 3, maxZoom: 17,
    }).addTo(mapa);
    L.marker([lat, lon]).addTo(mapa).bindPopup(`<b>${esc(w.bodega)}</b>${w.region ? `<br>${esc(w.region)}` : ''}`);
    bodegaMapaInstance = mapa;
    setTimeout(() => mapa.invalidateSize(), 50);
  }).catch(() => { el.closest('.terruno')?.remove(); });
}
function observarTerruno(w){
  limpiarTerruno();
  const el = $('#terruno');
  if (!el) return;
  if (typeof IntersectionObserver === 'undefined') return; // queda el botón "Ver en el mapa"
  terrunoIO = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) renderBodegaMapa(w);
  }, {root: sBody, threshold: .25});
  terrunoIO.observe(el);
}
alCerrar(limpiarTerruno);

/* ---------- Compartir (copia de compartirVino de public/index.html) ---------- */
async function compartirVino(id){
  const w = byId(id);
  if (!w) return;
  const url = location.origin + '/nueva#vino=' + id;
  const shareData = { title: '125cc · ' + w.nombre, text: `Mirá este vino: ${w.nombre} (${w.bodega})`, url };
  if (navigator.share) {
    try { await navigator.share(shareData); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    const el = $('#compartir-l');
    if (el) { const prev = el.textContent; el.textContent = 'Link copiado'; setTimeout(() => { if (el.isConnected) el.textContent = prev; }, 1600); }
  } catch (e) { prompt('Copiá este link:', url); }
}

/* ---------- Modos de la hoja ---------- */
MODOS.ficha = S => {
  const w = byId(S.id), p = ultimaPagina(w.id);
  return {body: fichaHTML(w), foot: '<button class="t-boton btn btn-primary" data-act="anotar" data-id="' + w.id + '">' + (p ? 'Anotar otra copa' : 'Anotar esta copa') + '</button>'};
};
MODOS_DESPUES.ficha = S => { observarTerruno(byId(S.id)); observarPerfil(); };
MODOS.mapa = () => {
  const tipos = tiposEnCarta();
  return {body: '<p class="t-eyebrow eyebrow">Carta por copa</p><h2 class="t-titulo-m titulo" id="sheet-title">Mapa del vino</h2><p class="sub">A la izquierda, los más frescos; a la derecha, los más complejos. Arriba, los más potentes.</p><div class="block">' + mapHTML({big: true}) + '</div><p class="legend-map">' + tipos.map(t => '<span><i style="background:' + TIPO[t].c + '"></i>' + t + '</span>').join('') + '</p>'};
};

export function abrirFicha(id){
  const w = byId(id);
  if (!w) return false;
  limpiarTerruno();
  openSheet('ficha', {id});
  registrar('abrir_vino', null, id);
  return true;
}

Object.assign(ACT, {
  ficha: (t, v, id) => { abrirFicha(+id); haptic(); },
  ampliar: () => openSheet('mapa'),
  terruno: () => { if (ui.sheet && ui.sheet.mode === 'ficha') renderBodegaMapa(byId(ui.sheet.id)); },
  compartir: (t, v, id) => compartirVino(+id),
});
