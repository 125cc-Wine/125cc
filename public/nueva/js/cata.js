// cata.js — anotar una copa: cata rápida (tres toques), cata completa en
// cinco pasos con la rueda de aromas, y el revelado ("lo que encontró el
// sommelier") comparando con aromas_somm / color_somm / perfil del vino.
// También edita una página existente y manda el resumen por WhatsApp.

import { $, ui, esc, fmt$, cap, descr, reduced, ms, ACT, haptic, toast, registrar } from './util.js';
import { byId, TIPO, FAMILIAS, famDe, COLOR_SIN_FAMILIA, COLORES, colorDe, QUICK, IMP, PRESET, PASOS, preguntaSomm } from './datos.js';
import { ICON_ASK, copaNivel, handCircle, arc, dots } from './dibujos.js';
import { store, mkPage, vinoDe, guardarPagina, actualizarPagina } from './store.js';
import { MODOS, MODOS_DESPUES, openSheet, renderSheet, sBody, sFoot } from './hoja.js';
import { pageCard } from './cuaderno.js';

const famColor = a => famDe(a) ? famDe(a).color : COLOR_SIN_FAMILIA;

/* ---------- Estado de la cata ---------- */
function nuevaCata(w){
  return {w, vinoId: w.id, modo: 'rapida', impresion: null, puntaje: 86, tocoPuntaje: false, aromas: [], nota: '', step: 0, color: null, intensidad: null, fam: null, intAroma: null, perfil: {cuerpo: null, frescura: null, taninos: null}, final: null, repetiria: null, editId: null};
}
// Editar: la cata arranca con lo que ya tenía la página
function cataDePagina(p){
  return Object.assign(nuevaCata(vinoDe(p)), {
    modo: p.modo, impresion: p.impresion, puntaje: p.puntaje, tocoPuntaje: true, aromas: (p.aromas || []).slice(), nota: p.nota || '',
    color: p.color, intensidad: p.intensidad, intAroma: p.intAroma,
    perfil: Object.assign({cuerpo: null, frescura: null, taninos: null}, p.perfil || {}),
    final: p.final, repetiria: p.repetiria, editId: p.id
  });
}

/* ---------- Cata rápida ---------- */
function rangeHTML(v){ return '<input type="range" class="range" id="score-r" min="60" max="100" step="1" value="' + v + '" style="--p:' + ((v - 60) / 40 * 100) + '%" aria-label="Puntaje de 60 a 100">'; }
function rapidaHTML(){
  const c = ui.cata, w = c.w;
  const quick = QUICK[w.tipo] || QUICK.Tinto;
  // Al editar, que se vean también los aromas que ya tenía y no están en la lista corta
  const extras = c.aromas.filter(a => !quick.includes(a));
  return '<p class="t-eyebrow eyebrow">Cata rápida · tres toques</p><h2 class="t-titulo-m titulo" id="sheet-title">' + esc(w.nombre) + '</h2>'
    + '<div class="q"><p class="q-t">¿Cómo te cayó?</p><div class="imp">'
    + IMP.map(([v, l, f]) => '<button class="imp-b" data-act="imp" data-v="' + v + '" aria-pressed="' + (c.impresion === v) + '">' + copaNivel(f, (TIPO[w.tipo] || TIPO.Tinto).c) + '<span>' + l + '</span></button>').join('')
    + '</div></div>'
    + '<div class="q"><div class="q-row"><p class="q-t">Puntaje</p><p class="score-read"><span id="score-n" class="score-m">' + c.puntaje + '</span><span id="score-d" class="score-desc">' + descr(c.puntaje) + '</span></p></div>' + rangeHTML(c.puntaje) + '<div class="range-l"><span>60</span><span>100</span></div></div>'
    + '<div class="q"><p class="q-t">Un aroma que encuentres</p><div class="tags">'
    + extras.concat(quick).map(a => '<button class="tag-b" data-act="aroma-q" data-v="' + esc(a) + '" aria-pressed="' + c.aromas.includes(a) + '" style="--fc:' + famColor(a) + '">' + esc(a) + '</button>').join('')
    + '</div></div>'
    + '<div class="q"><label class="q-t" for="nota-txt">Una nota <span class="optional">opcional</span></label><textarea id="nota-txt" rows="2" placeholder="Lo que te quieras acordar de esta copa">' + esc(c.nota) + '</textarea></div>';
}
function rapidaFoot(){
  return '<button class="t-boton btn btn-ghost" data-act="completa">Cata completa</button><button class="t-boton btn btn-primary" id="btn-guardar" data-act="guardar-rapida"' + (ui.cata.impresion ? '' : ' disabled') + '>Guardar</button>';
}
function setScore(n){
  const c = ui.cata; c.puntaje = n;
  const r = $('#score-r'); if (r) { r.value = n; r.style.setProperty('--p', ((n - 60) / 40 * 100) + '%'); }
  const sn = $('#score-n'); if (sn) sn.textContent = n;
  const sd = $('#score-d'); if (sd) sd.textContent = descr(n);
}

/* ---------- Cata completa ---------- */
function vasoHTML(){
  const ticks = [1,2,3,4,5].map(k => { const y = (70 - k * 12.4).toFixed(1); return '<line x1="80" y1="' + y + '" x2="' + (k === 5 ? 88 : 85) + '" y2="' + y + '" stroke="var(--ink-faint)" stroke-width="1"/>'; }).join('');
  return '<svg viewBox="0 0 96 130" class="vaso" aria-hidden="true"><defs><clipPath id="vaso-clip"><path d="M14 8H76C76 50 63 70 45 70C27 70 14 50 14 8Z"/></clipPath></defs>'
    + '<g clip-path="url(#vaso-clip)"><rect id="cc-liq" class="vaso-liq" x="0" y="8" width="96" height="64" fill="var(--tipo-tinto)" style="transform:translateY(64px)"/></g>'
    + '<path d="M14 8H76C76 50 63 70 45 70C27 70 14 50 14 8Z" fill="none" stroke="var(--ink-soft)" stroke-width="1.6"/>'
    + '<path d="M45 70V114M30 118H60" fill="none" stroke="var(--ink-soft)" stroke-width="1.8" stroke-linecap="round"/>'
    + ticks + '<text x="91" y="5" text-anchor="end" font-family="DM Sans, sans-serif" font-size="8" font-weight="600" fill="var(--ink-faint)">125</text></svg>';
}
function completaShell(){
  return '<div class="cc-head"><div>' + vasoHTML() + '</div><div><p class="t-eyebrow eyebrow" id="cc-paso"></p><h2 class="t-titulo-m titulo" id="sheet-title"></h2><p class="cc-wine">' + esc(ui.cata.w.nombre) + '</p></div></div><div id="cc-step"></div>';
}
function escala(key, val, lo, hi){
  return '<div class="scale" role="group" aria-label="' + key + '">' + [1,2,3,4,5].map(i => '<button data-act="esc" data-k="' + key + '" data-v="' + i + '" class="' + (val && i <= val ? 'fill' : '') + (val === i ? ' on' : '') + '" aria-pressed="' + (val === i) + '" aria-label="' + i + ' de 5"></button>').join('') + '</div><div class="scale-l"><span>' + lo + '</span><span>' + hi + '</span></div>';
}
function wheelSVG(c){
  const cx = 140, cy = 140, r0 = 50, r1 = 128, step = 360 / FAMILIAS.length;
  const segs = FAMILIAS.map((f, i) => {
    const a0 = -90 - step / 2 + i * step + 1.2, a1 = a0 + step - 2.4, am = (a0 + a1) / 2, rad = am * Math.PI / 180;
    const on = c.fam === f.id, cnt = c.aromas.filter(a => famDe(a) && famDe(a).id === f.id).length;
    const off = on ? 7 : 0, lr = (r0 + r1) / 2 + 2;
    const lx = cx + Math.cos(rad) * lr, ly = cy + Math.sin(rad) * lr;
    const label = f.l.length === 1
      ? '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="12" font-weight="600" fill="' + f.tx + '">' + f.l[0] + '</text>'
      : '<text x="' + lx.toFixed(1) + '" y="' + (ly - 2).toFixed(1) + '" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="11.5" font-weight="600" fill="' + f.tx + '"><tspan x="' + lx.toFixed(1) + '">' + f.l[0] + '</tspan><tspan x="' + lx.toFixed(1) + '" dy="13">' + f.l[1] + '</tspan></text>';
    const bx = cx + Math.cos(rad) * (r1 - 12), by = cy + Math.sin(rad) * (r1 - 12);
    const badge = cnt ? '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="8.5" fill="var(--ink)"/><text x="' + bx.toFixed(1) + '" y="' + (by + 3.6).toFixed(1) + '" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="10" font-weight="700" fill="var(--bg)">' + cnt + '</text>' : '';
    return '<g class="seg" data-act="fam" data-v="' + f.id + '" role="button" tabindex="0" aria-pressed="' + on + '" aria-label="' + f.nombre + (cnt ? ', ' + cnt + ' elegido' + (cnt > 1 ? 's' : '') : '') + '" style="transform:translate(' + (Math.cos(rad) * off).toFixed(1) + 'px,' + (Math.sin(rad) * off).toFixed(1) + 'px)">'
      + '<path d="' + arc(cx, cy, r0, r1, a0, a1) + '" fill="' + f.color + '" fill-opacity="' + (on ? 1 : (c.fam ? .55 : .85)) + '" stroke="' + (on ? 'var(--ink)' : 'none') + '" stroke-width="2"/>' + label + badge + '</g>';
  }).join('');
  const n = c.aromas.length;
  return '<svg viewBox="0 0 280 280" class="wheel" role="group" aria-label="Rueda de aromas">' + segs
    + '<circle cx="140" cy="140" r="44" fill="var(--surface-2)"/>'
    + (n ? '<text x="140" y="142" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="24" font-weight="600" fill="var(--ink)">' + n + '</text><text x="140" y="160" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="9.5" font-weight="600" letter-spacing="1.4" fill="var(--ink-soft)">' + (n === 1 ? 'AROMA' : 'AROMAS') + '</text>'
         : '<text x="140" y="144" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="9.5" font-weight="600" letter-spacing="1.4" fill="var(--ink-soft)">AROMAS</text>')
    + '</svg>';
}
function stepValido(c, w){
  return [
    !!c.color,
    c.aromas.length > 0,
    !!(c.perfil.cuerpo && c.perfil.frescura && (w.tipo !== 'Tinto' || c.perfil.taninos) && c.final),
    !!c.repetiria,
    true
  ][c.step];
}
const FALTA = ['Elegí un color para seguir.', 'Elegí al menos un aroma para seguir.', 'Completá cuerpo, frescura, taninos y final para seguir.', 'Contanos si lo volverías a pedir.', ''];
function stepBody(c, w){
  const s = c.step;
  let h = '<p class="hint">' + PASOS[s][1] + '</p>';
  if (s === 0) {
    h += '<div class="q"><p class="q-t">Color</p><div class="swatches">'
      + (COLORES[w.tipo] || COLORES.Tinto).map(([n, hex]) => '<button class="sw" data-act="color" data-v="' + n + '" aria-pressed="' + (c.color === n) + '"><i style="background:' + hex + '"></i><span>' + n + '</span></button>').join('')
      + '<button class="sw" data-act="color" data-v="Otro" aria-pressed="' + (c.color === 'Otro') + '"><i class="sw-otro"></i><span>Otro</span></button></div></div>'
      + '<div class="q"><p class="q-t">Intensidad del color</p>' + escala('intensidad', c.intensidad, 'Pálida', 'Profunda') + '</div>';
  } else if (s === 1) {
    const f = FAMILIAS.find(x => x.id === c.fam);
    h += wheelSVG(c)
      + '<div class="fam-box">' + (f
        ? '<p class="q-t">' + f.nombre + '</p><div class="tags">' + f.aromas.map(a => '<button class="tag-b" data-act="aroma" data-v="' + a + '" aria-pressed="' + c.aromas.includes(a) + '" style="--fc:' + f.color + '">' + a + '</button>').join('') + '</div>'
        : '<p class="fam-empty">Tocá una familia de la rueda para ver sus aromas.</p>') + '</div>'
      + (c.aromas.length ? '<div class="q"><p class="q-t">Tus aromas</p><div class="tags">' + c.aromas.map(a => '<button class="tag-b" data-act="aroma" data-v="' + esc(a) + '" aria-pressed="true" aria-label="Quitar ' + esc(a) + '" style="--fc:' + famColor(a) + '">' + esc(a) + ' ×</button>').join('') + '</div></div>' : '')
      + '<div class="q"><p class="q-t">Intensidad aromática</p>' + escala('intAroma', c.intAroma, 'Tímida', 'Intensa') + '</div>';
  } else if (s === 2) {
    h += '<div class="q"><p class="q-t">Cuerpo</p>' + escala('cuerpo', c.perfil.cuerpo, 'Liviano', 'Potente') + '</div>'
      + '<div class="q"><p class="q-t">Frescura</p>' + escala('frescura', c.perfil.frescura, 'Suave', 'Vibrante') + '</div>'
      + (w.tipo === 'Tinto' ? '<div class="q"><p class="q-t">Taninos</p>' + escala('taninos', c.perfil.taninos, 'Sedosos', 'Firmes') + '</div>' : '')
      + '<div class="q"><p class="q-t">Final</p><div class="seg3">' + ['Corto','Medio','Largo'].map(v => '<button data-act="final" data-v="' + v + '" aria-pressed="' + (c.final === v) + '">' + v + '</button>').join('') + '</div></div>';
  } else if (s === 3) {
    h += '<div class="q"><p class="q-t">¿Lo volverías a pedir?</p><div class="seg3">' + ['Sí','Tal vez','No'].map(v => '<button data-act="repetir" data-v="' + v + '" aria-pressed="' + (c.repetiria === v) + '">' + v + '</button>').join('') + '</div></div>'
      + '<div class="q"><label class="q-t" for="nota-txt">Tu nota <span class="optional">opcional</span></label><textarea id="nota-txt" rows="4" placeholder="Con quién estabas, qué comiste, qué te sorprendió">' + esc(c.nota) + '</textarea></div>';
  } else {
    h += '<div class="score-hero"><span id="score-n" class="t-puntaje-xl">' + c.puntaje + '</span><span id="score-d" class="score-desc">' + descr(c.puntaje) + '</span></div>' + rangeHTML(c.puntaje) + '<div class="range-l"><span>60</span><span>80</span><span>100</span></div>';
  }
  if (!stepValido(c, w)) h += '<p class="need">' + (s === 2 && w.tipo !== 'Tinto' ? 'Completá cuerpo, frescura y final para seguir.' : FALTA[s]) + '</p>';
  return h;
}
function renderStep(keepScroll){
  const c = ui.cata, w = c.w, s = c.step;
  const st = sBody.scrollTop;
  $('#cc-paso').textContent = 'Paso ' + (s + 1) + ' de 5 · ' + (25 * (s + 1)) + ' cc';
  $('#sheet-title').textContent = PASOS[s][0];
  $('#cc-step').innerHTML = stepBody(c, w);
  const liq = $('#cc-liq');
  if (liq) {
    liq.setAttribute('fill', colorDe(w.tipo, c.color) || (TIPO[w.tipo] || TIPO.Tinto).c);
    requestAnimationFrame(() => { liq.style.transform = 'translateY(' + ((1 - (s + 1) / 5) * 62 + 2) + 'px)'; });
  }
  const fin = c.editId ? 'Guardar cambios' : 'Ver qué encontró el somm';
  sFoot.innerHTML = '<button class="t-boton btn btn-ghost" data-act="paso-ant">' + (s === 0 ? 'Rápida' : 'Atrás') + '</button><button class="t-boton btn btn-primary" data-act="paso-sig"' + (stepValido(c, w) ? '' : ' disabled') + '>' + (s === 4 ? fin : 'Siguiente') + '</button>';
  sBody.scrollTop = keepScroll ? st : 0;
}

/* ---------- Revelado ---------- */
function comparar(p, w){
  const tus = p.aromas || [], somm = w.aromas_somm || [];
  const exact = somm.filter(a => tus.includes(a));
  const famT = new Set(tus.map(a => famDe(a) && famDe(a).id));
  const fam = somm.filter(a => !exact.includes(a) && famDe(a) && famT.has(famDe(a).id));
  const faltan = somm.filter(a => !exact.includes(a) && !fam.includes(a));
  return {exact, fam, faltan};
}
export function revealAromas(p, w, compact){
  const s = w.aromas_somm;
  if (!s || !s.length) return '';
  const {exact, fam, faltan} = comparar(p, w);
  let head;
  if (exact.length > 1) head = 'Buen olfato: coincidiste con el sommelier en ' + exact.length + ' aromas.';
  else if (exact.length === 1) head = 'Coincidiste con el sommelier en <strong>' + esc(exact[0]) + '</strong>.';
  else if (fam.length) head = 'Ibas bien: el somm también encontró ' + famDe(fam[0]).nombre.toLowerCase() + '.';
  else head = 'Esta vez fueron por lados distintos. En la próxima copa buscá <strong>' + esc(faltan[0]) + '</strong>.';
  const leg = [];
  if (exact.length) leg.push('<span><i class="lg t-match"></i>Coincidieron</span>');
  if (fam.length) leg.push('<span><i class="lg t-fam"></i>Misma familia</span>');
  if (faltan.length) leg.push('<span><i class="lg t-miss"></i>Para buscar</span>');
  return '<div class="block"><p class="block-t">' + (compact ? 'El sommelier anotó' : 'Aromas') + '</p><p class="reveal-h">' + head + '</p><div class="tags revela">'
    + s.map((a, i) => '<span class="tag ' + (exact.includes(a) ? 't-match' : fam.includes(a) ? 't-fam' : 't-miss') + '" style="--i:' + i + '">' + esc(a) + '</span>').join('')
    + '</div><p class="legend-s">' + leg.join('') + '</p></div>';
}
export function perfilCompare(tu, bod, tipo){
  return ['cuerpo','frescura','taninos'].filter(k => k !== 'taninos' || tipo === 'Tinto').map(k =>
    '<div class="pc-row"><span class="pc-k">' + cap(k) + '</span><span class="pc-v"><span class="pc-l">Vos</span>' + dots(tu[k]) + '</span><span class="pc-v"><span class="pc-l">Bodega</span>' + dots(bod[k], 'oak') + '</span></div>').join('');
}
function reveladoHTML(p, w){
  return '<div class="rev-top"><div class="rev-score">' + handCircle() + '<span class="rev-n" id="rev-n">' + p.puntaje + '</span></div><div><p class="t-eyebrow eyebrow">125 cc catados · ' + descr(p.puntaje) + '</p><h2 class="t-titulo-m titulo" id="sheet-title">Lo que encontró el sommelier</h2><p class="sub">' + esc(w.nombre) + '</p></div></div>'
    + revealAromas(p, w, false)
    + (p.perfil && w.perfil && w.perfil.cuerpo ? '<div class="block"><p class="block-t">En boca <span>vos y la ficha de la bodega</span></p>' + perfilCompare(p.perfil, w.perfil, w.tipo) + '</div>' : '')
    + (w.color_somm && p.color && p.color !== 'Otro' ? '<div class="block"><p class="block-t">Color</p><p class="cmp-line">' + (p.color === w.color_somm ? 'Lo viste igual que el somm: <strong>' + esc(w.color_somm) + '</strong>.' : 'Vos lo viste <strong>' + esc(p.color) + '</strong>; el somm, <strong>' + esc(w.color_somm) + '</strong>.') + '</p></div>' : '')
    + '<p class="ask">' + ICON_ASK + '<span>' + esc(preguntaSomm(w)) + '</span></p>';
}
function animarPuntaje(){
  const el = $('#rev-n'); if (!el || reduced()) return;
  const to = +el.textContent, from = 60, t0 = performance.now(), dur = ms('--dur-trazo');
  const tick = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
  el.textContent = from; requestAnimationFrame(tick);
}

/* ---------- WhatsApp (mismo envío que la carta actual: /api/send-whatsapp) ---------- */
// copia de normalizarTelefono() de public/index.html
function normalizarTelefono(phone){
  if (!phone) return '';
  let p = phone.toString().replace(/[^\d+]/g, '');
  if (p.startsWith('0')) p = '+54' + p.slice(1);
  if (!p.startsWith('+')) p = '+54' + p;
  return p;
}
function waHTML(S){
  if (!S.wa) return '<button class="t-boton btn btn-ghost btn-wa" data-act="wa-abrir">Mandámelo por WhatsApp</button>';
  return '<form class="wa-form" id="wa-form" novalidate><p class="mail-t">Por WhatsApp</p><p class="mail-s">Te mandamos el vino, tu puntaje y tu nota.</p>'
    + '<div class="mail-row"><input id="wa-in" type="tel" inputmode="tel" autocomplete="tel" placeholder="223 123-4567" aria-label="Tu celular"><button class="t-boton btn btn-primary sm" type="submit" id="wa-btn">Enviar</button></div>'
    + '<p class="mail-err" id="wa-err" hidden>Revisá el número: parece que falta algo.</p>'
    + '<button class="link wa-no" type="button" data-act="wa-cerrar">Mejor no</button></form>';
}
async function enviarWA(){
  const S = ui.sheet; if (!S) return;
  const p = store.pages.find(x => x.id === S.pageId); if (!p) return;
  const phone = normalizarTelefono($('#wa-in').value.trim());
  if (!/^\+?\d{8,15}$/.test(phone)) { $('#wa-err').hidden = false; return; }
  const btn = $('#wa-btn'); btn.disabled = true; btn.textContent = 'Enviando…';
  const s = p.snap;
  try {
    const r = await fetch('/api/send-whatsapp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      phone, wineName: s.nombre, winery: s.bodega || '', varietal: s.varietal || '',
      price: fmt$(s.copa), glass: '125 cc', rating: p.puntaje, ratingLabel: descr(p.puntaje),
      sabor: (p.aromas || []).slice(0, 5).join(', '), opinion: p.nota || '',
    })});
    toast(r.ok ? 'Listo, te llega por WhatsApp' : 'No pudimos mandarlo. Probá más tarde.');
  } catch (e) { toast('No pudimos mandarlo. Revisá la conexión.'); }
  if (ui.sheet === S) { S.wa = false; renderSheet(true); }
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'wa-form') return;
  e.preventDefault(); enviarWA();
});

/* ---------- Modos de la hoja ---------- */
MODOS.rapida = () => ({body: rapidaHTML(), foot: rapidaFoot()});
MODOS.completa = () => { sBody.innerHTML = completaShell(); sFoot.innerHTML = ''; renderStep(false); return null; };
MODOS.guardado = S => {
  const p = store.pages.find(x => x.id === S.pageId), w = vinoDe(p);
  return {
    body: '<div class="saved-head"><svg class="check" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="22" cy="22" r="20" stroke-width="1.4"/><path d="M13 23l6 6 12-13"/></svg><div><p class="t-eyebrow eyebrow">Guardado en tu cuaderno</p><h2 class="t-titulo-m titulo" id="sheet-title">Una página más</h2></div></div>'
      + pageCard(p) + revealAromas(p, w, true)
      + (!store.email && store.pages.length === 1 ? '<p class="need">Tu primera página. Si querés no perderla, dejá tu email en Mi cuaderno.</p>' : '')
      + waHTML(S),
    foot: '<button class="t-boton btn btn-ghost" data-act="ir-cuaderno">Ver mi cuaderno</button><button class="t-boton btn btn-primary" data-act="cerrar">Seguir con la carta</button>'
  };
};
MODOS.revelado = S => {
  const p = store.pages.find(x => x.id === S.pageId), w = vinoDe(p);
  return {
    body: reveladoHTML(p, w) + waHTML(S),
    foot: '<button class="t-boton btn btn-ghost" data-act="pagina" data-id="' + p.id + '">Ver mi página</button><button class="t-boton btn btn-primary" data-act="cerrar">Seguir con la carta</button>'
  };
};
MODOS_DESPUES.revelado = S => { if (!S.wa && !S.animado) { S.animado = true; animarPuntaje(); } };

/* ---------- Guardar ---------- */
function terminarEdicion(p){
  actualizarPagina(p);
  openSheet('pagina', {pageId: p.id});
  toast('Página actualizada');
  haptic(16);
}

Object.assign(ACT, {
  anotar: (t, v, id) => { const w = byId(+id); if (!w) return; ui.cata = nuevaCata(w); openSheet('rapida'); },
  'editar-pagina': () => {
    const p = store.pages.find(x => x.id === ui.sheet.pageId); if (!p) return;
    ui.cata = cataDePagina(p);
    openSheet(p.modo === 'completa' ? 'completa' : 'rapida');
  },
  imp: (t, v) => {
    const c = ui.cata; c.impresion = v;
    if (!c.tocoPuntaje) setScore(PRESET[v]);
    sBody.querySelectorAll('[data-act="imp"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    const g = $('#btn-guardar'); if (g) g.disabled = false;
    haptic();
  },
  'aroma-q': (t, v) => {
    const c = ui.cata; c.aromas = c.aromas.length === 1 && c.aromas[0] === v ? [] : [v];
    sBody.querySelectorAll('[data-act="aroma-q"]').forEach(b => b.setAttribute('aria-pressed', String(c.aromas.includes(b.dataset.v))));
    haptic();
  },
  'guardar-rapida': () => {
    const c = ui.cata;
    const datos = {modo: 'rapida', impresion: c.impresion, puntaje: c.puntaje, aromas: c.aromas.slice(), nota: c.nota.trim()};
    if (c.editId) { const p = store.pages.find(x => x.id === c.editId); if (p) { Object.assign(p, datos); ui.cata = null; terminarEdicion(p); } return; }
    const p = mkPage(c.w, datos);
    guardarPagina(p); ui.cata = null;
    registrar('anotar_rapida', {puntaje: p.puntaje, impresion: p.impresion}, c.vinoId);
    openSheet('guardado', {pageId: p.id}); haptic(16);
  },
  completa: () => {
    const c = ui.cata; c.modo = 'completa'; c.step = 0; openSheet('completa');
    if (!c.editId) registrar('paso_cata', {paso: 1}, c.vinoId);
  },
  color: (t, v) => { ui.cata.color = v; renderStep(true); haptic(); },
  esc: (t, v) => { const c = ui.cata, k = t.dataset.k; if (k in c.perfil) c.perfil[k] = +v; else c[k] = +v; renderStep(true); haptic(); },
  fam: (t, v) => { ui.cata.fam = ui.cata.fam === v ? null : v; renderStep(true); haptic(); },
  aroma: (t, v) => { const c = ui.cata; c.aromas = c.aromas.includes(v) ? c.aromas.filter(a => a !== v) : c.aromas.concat(v); renderStep(true); haptic(); },
  final: (t, v) => { ui.cata.final = v; renderStep(true); },
  repetir: (t, v) => { ui.cata.repetiria = v; renderStep(true); },
  'paso-ant': () => { const c = ui.cata; if (c.step === 0) { c.modo = 'rapida'; openSheet('rapida'); } else { c.step--; renderStep(false); } },
  'paso-sig': () => {
    const c = ui.cata;
    if (c.step < 4) {
      c.step++; renderStep(false);
      if (!c.editId) registrar('paso_cata', {paso: c.step + 1}, c.vinoId);
      return;
    }
    const imp = c.puntaje >= 90 ? 'encanto' : c.puntaje >= 80 ? 'gusto' : 'no';
    const perfil = Object.assign({}, c.perfil);
    if (c.w.tipo !== 'Tinto') perfil.taninos = null;
    const datos = {modo: 'completa', impresion: imp, puntaje: c.puntaje, color: c.color, intensidad: c.intensidad, aromas: c.aromas.slice(), intAroma: c.intAroma, perfil, final: c.final, repetiria: c.repetiria, nota: c.nota.trim()};
    if (c.editId) { const p = store.pages.find(x => x.id === c.editId); if (p) { Object.assign(p, datos); ui.cata = null; terminarEdicion(p); } return; }
    const p = mkPage(c.w, datos);
    guardarPagina(p); ui.cata = null;
    registrar('anotar_completa', {puntaje: p.puntaje}, c.vinoId);
    registrar('revelado', {aromas_somm: (c.w.aromas_somm || []).length > 0, coincidencias: comparar(p, c.w).exact.length}, c.vinoId);
    openSheet('revelado', {pageId: p.id}); haptic(20);
  },
  'wa-abrir': () => { ui.sheet.wa = true; renderSheet(true); setTimeout(() => { const i = $('#wa-in'); if (i) i.focus(); }, 50); },
  'wa-cerrar': () => { ui.sheet.wa = false; renderSheet(true); },
});

document.addEventListener('input', e => {
  if (e.target.id === 'score-r' && ui.cata) { ui.cata.tocoPuntaje = true; setScore(+e.target.value); }
  if (e.target.id === 'nota-txt' && ui.cata) ui.cata.nota = e.target.value;
});
