// hoja.js — la hoja que sube desde abajo (página del vino, cata, cuaderno):
// abrir, cerrar con la X, arrastrando hacia abajo, con Escape o con el
// botón atrás del celular (cada apertura empuja un estado al historial).
// Cada módulo registra cómo se dibuja su modo en MODOS.

import { $, ui, vistas, ms } from './util.js';

// MODOS[modo](S) → {body, foot} para dibujarlo acá, o null si el modo se
// dibuja solo. MODOS_DESPUES[modo](S) corre después de pintar.
export const MODOS = {};
export const MODOS_DESPUES = {};

const sheet = $('#sheet'), scrim = $('#scrim');
export const sBody = $('#sheet-body'), sFoot = $('#sheet-foot');
let abierta = false, pushed = false;
export const hojaAbierta = () => abierta;

export function renderSheet(keepScroll){
  const S = ui.sheet; if (!S) return;
  const st = sBody.scrollTop;
  const r = MODOS[S.mode] ? MODOS[S.mode](S) : null;
  if (r) {
    sBody.innerHTML = r.body || '';
    sFoot.innerHTML = r.foot || '';
    sBody.scrollTop = keepScroll ? st : 0;
  }
  if (MODOS_DESPUES[S.mode]) MODOS_DESPUES[S.mode](S);
}
export function openSheet(mode, data){
  ui.sheet = Object.assign({mode}, data || {});
  renderSheet(false);
  if (!abierta) {
    abierta = true; sheet.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); }));
    document.body.classList.add('locked');
    try { history.pushState({sheet: 1}, ''); pushed = true; } catch (e) { pushed = false; }
    setTimeout(() => { try { sheet.focus({preventScroll: true}); } catch (e) {} }, 60);
  }
}
const cierres = [];
export const alCerrar = fn => cierres.push(fn);
export function hideSheet(){
  abierta = false; ui.sheet = null; ui.cata = null;
  sheet.classList.remove('open'); scrim.classList.remove('open'); document.body.classList.remove('locked');
  setTimeout(() => { if (!abierta) { sheet.hidden = true; scrim.hidden = true; sheet.style.transform = ''; sBody.innerHTML = ''; } }, ms('--dur-hoja'));
  cierres.forEach(fn => fn());
  vistas.refresh();
}
export function requestClose(){
  if (pushed) { pushed = false; history.back(); setTimeout(() => { if (abierta) hideSheet(); }, ms('--dur-hoja')); }
  else hideSheet();
}
addEventListener('popstate', () => { if (abierta) { pushed = false; hideSheet(); } });

// Arrastrar la manija hacia abajo para cerrar
(() => {
  const grab = $('#sheet-grab'); let drag = null;
  grab.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; drag = {y: e.clientY, dy: 0}; sheet.style.transition = 'none'; try { grab.setPointerCapture(e.pointerId); } catch (er) {} });
  grab.addEventListener('pointermove', e => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); sheet.style.transform = 'translateY(' + drag.dy + 'px)'; });
  const end = () => { if (!drag) return; const close = drag.dy > 110; drag = null; sheet.style.transition = ''; sheet.style.transform = ''; if (close) requestClose(); };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
})();
