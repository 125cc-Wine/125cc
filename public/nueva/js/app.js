// app.js — arranque de la carta nueva (/nueva): carga la carta, arma las
// tres vistas (Carta, ¿Qué tomo?, Mi cuaderno), la barra inferior, el tema
// noche/día, las rutas por hash (#carta, #que-tomo, #cuaderno y #vino=ID
// para los enlaces de "Compartir") y despacha las acciones data-act.

import { $, ui, ACT, vistas } from './util.js';
import { cargarCarta } from './datos.js';
import { store, save, load, sincronizar } from './store.js';
import { calcularLayout, renderCarta } from './mapa.js';
import { hojaAbierta, hideSheet, requestClose } from './hoja.js';
import { abrirFicha } from './ficha.js';
import './cata.js';
import { renderCuaderno } from './cuaderno.js';
import { renderQueTomo } from './somm.js';
import './tarjeta.js';

const VISTAS = ['carta', 'que-tomo', 'cuaderno'];

function updateBadge(){ const b = $('#badge'), n = store.pages.length; b.hidden = !n; b.textContent = n; }
function refresh(){
  if (ui.view === 'carta') renderCarta();
  if (ui.view === 'cuaderno') renderCuaderno();
  if (ui.view === 'que-tomo') renderQueTomo();
  updateBadge();
}
function showView(v){
  ui.view = v; ui.confirm = null;
  VISTAS.forEach(k => { $('#view-' + k).hidden = k !== v; const nb = $('#nav-' + k); if (k === v) nb.setAttribute('aria-current', 'page'); else nb.removeAttribute('aria-current'); });
  refresh();
  window.scrollTo(0, 0);
  try { history.replaceState(history.state, '', '#' + v); } catch (e) {}
}
Object.assign(vistas, {refresh, mostrar: showView, badge: updateBadge});

function applyTheme(){
  const root = document.documentElement;
  if (store.theme) root.setAttribute('data-theme', store.theme);
  const dark = (root.getAttribute('data-theme') || 'dark') !== 'light';
  const btn = $('#theme-btn');
  btn.setAttribute('aria-label', dark ? 'Pasar a modo día' : 'Pasar a modo noche');
  btn.innerHTML = dark
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

Object.assign(ACT, {
  view: (t, v) => { if (hojaAbierta()) hideSheet(); showView(v); },
  cerrar: () => requestClose(),
  theme: () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    store.theme = cur === 'light' ? 'dark' : 'light'; save(); applyTheme();
  },
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = ACT[t.dataset.act];
  if (fn) fn(t, t.dataset.v, t.dataset.id, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && hojaAbierta()) { requestClose(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  }
});

/* ---------- Arranque ---------- */
load();
applyTheme();
updateBadge();
const hash = (location.hash || '').slice(1);
const vinoLink = /(?:^|&)vino=(\d+)/.exec(hash); // enlaces de "Compartir": /nueva#vino=35
showView(VISTAS.includes(hash) ? hash : 'carta');

cargarCarta(() => { calcularLayout(); refresh(); }).then(ok => {
  ui.cargada = true;
  if (ok) calcularLayout();
  refresh();
  if (vinoLink) abrirFicha(+vinoLink[1]);
  // Reintenta lo que quedó sin subir y trae lo nuevo del email (sin frenar nada)
  if (store.email) sincronizar();
});
// Un enlace #vino=ID tocado con la carta ya abierta no recarga la página
addEventListener('hashchange', () => {
  const m = /(?:^|&)vino=(\d+)/.exec(location.hash.slice(1));
  if (m && ui.cargada) abrirFicha(+m[1]);
});
