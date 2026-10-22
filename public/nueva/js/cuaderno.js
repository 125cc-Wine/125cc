// cuaderno.js — Mi cuaderno: cada copa anotada es una página (aunque el
// vino ya haya salido de carta), tu paladar sobre el mapa, la última noche
// y los sellos por región. El email asocia el cuaderno a la hoja de catas.

import { $, ui, esc, cap, fechaCorta, fechaLarga, quincena, quincenaKey, ACT, toast, registrar, vistas } from './util.js';
import { carta, famDe, colorDe, IMP_L, regionKey } from './datos.js';
import { copita, blot, handCircle } from './dibujos.js';
import { store, save, vinoDe, paladar, frasePaladar, ultimaNoche, borrarPagina, setEmail, olvidarEmail, EMAIL_RE } from './store.js';
import { mapHTML } from './mapa.js';
import { MODOS, openSheet, renderSheet, requestClose, hideSheet } from './hoja.js';
import { revealAromas, perfilCompare } from './cata.js';

/* ---------- Hoja de cuaderno ---------- */
export function pageCard(p, o){
  o = o || {};
  const d = new Date(p.fecha), s = p.snap, hex = p.color ? colorDe(s.tipo, p.color) : null;
  const rots = [-2.5, 1.8, -1, 2.6, -1.8];
  const foot = [p.modo === 'completa' ? 'Cata completa' : 'Cata rápida'];
  if (p.repetiria) foot.push('¿Repetirías? ' + esc(p.repetiria));
  else if (p.impresion) foot.push(IMP_L[p.impresion]);
  const pend = p.pendiente && store.email ? '<span class="pg-pend">· sin subir todavía</span>' : '';
  return '<article class="page' + (o.btn ? ' page-btn' : '') + '"' + (o.btn ? ' data-act="pagina" data-id="' + p.id + '" role="button" tabindex="0" aria-label="Página de ' + esc(s.nombre) + ', ' + p.puntaje + ' puntos"' : '') + '>'
    + '<div class="pg-top"><p class="pg-date">' + fechaCorta(d) + ' · ' + (d.getDate() <= 15 ? '1ª' : '2ª') + ' quincena</p></div>'
    + '<h3 class="pg-name">' + esc(s.nombre) + '</h3><p class="pg-meta">' + esc([s.bodega, s.varietal].filter(Boolean).join(' · ')) + '</p>'
    + '<div class="pg-score">' + handCircle() + '<span>' + p.puntaje + '</span></div>'
    + '<div class="pg-row">' + (hex ? '<span class="blot" title="' + esc(p.color) + '">' + blot(hex) + '</span>' : '') + ((p.aromas || []).length ? '<div class="stamps">' + p.aromas.map((a, i) => '<span class="stamp" style="--fc:' + (famDe(a) ? famDe(a).paper : '#57503F') + ';--rot:' + rots[i % 5] + 'deg">' + esc(a) + '</span>').join('') + '</div>' : '') + '</div>'
    + (p.nota ? '<p class="pg-nota">' + esc(p.nota) + '</p>' : '')
    + '<p class="pg-foot">' + foot.join(' · ') + pend + '</p></article>';
}

/* ---------- Mi cuaderno ---------- */
function selloHTML(name, on, i){
  const rot = [-6, 4, -2, 7, -4][i % 5];
  return '<span class="sello' + (on ? ' on' : '') + '" style="--rot:' + rot + 'deg" title="' + esc(name) + (on ? '' : ' (todavía no)') + '"><svg viewBox="0 0 86 86" aria-hidden="true"><circle cx="43" cy="43" r="40" fill="none" stroke="currentColor" stroke-width="2"' + (on ? '' : ' stroke-dasharray="4 4"') + '/><circle cx="43" cy="43" r="33" fill="none" stroke="currentColor" stroke-width="1"' + (on ? '' : ' opacity=".5"') + '/>' + (on ? '<text x="43" y="20" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="9" font-weight="700" fill="currentColor">125cc</text>' : '') + '</svg><span class="sello-t">' + esc(name) + '</span></span>';
}
function mailHTML(){
  if (store.email) return '<p class="saved-mail">Cuaderno asociado a <strong>' + esc(store.email) + '</strong>. Lo recuperás desde cualquier celular con el mismo email.<button class="link" data-act="cambiar-email">Cambiar</button></p>';
  return '<form class="mail" id="mail-form" novalidate><p class="mail-t">Guardá tu cuaderno</p><p class="mail-s">Con tu email lo recuperás en otro celular y no se pierde si borrás el navegador. Si ya cataste en 125cc con ese email, tus catas aparecen acá.</p><div class="mail-row"><input id="mail-in" type="email" inputmode="email" autocomplete="email" placeholder="tu@email.com" aria-label="Tu email"><button class="btn btn-primary sm" type="submit" id="mail-btn">Guardar</button></div><p class="mail-err" id="mail-err" hidden>Revisá el email: parece que falta algo.</p></form>';
}
export function renderCuaderno(){
  const el = $('#view-cuaderno');
  const pages = [...store.pages].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const head = '<div class="cu-head"><p class="eyebrow">Tu libreta de 125cc</p><h1 class="h1">Mi cuaderno</h1>';
  if (!pages.length) {
    el.innerHTML = head + '</div><div class="empty"><svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M60 16C46 8 26 8 10 12V80C26 76 46 76 60 84C74 76 94 76 110 80V12C94 8 74 8 60 16Z"/><path d="M60 16V84M20 28H48M20 38H48M20 48H40M72 28H100M72 38H100"/></svg><p class="empty-t">Tu cuaderno está en blanco</p><p>Elegí un vino de la carta y tocá <strong>Anotar esta copa</strong>. Cada copa queda acá como una página, aunque el vino salga de carta.</p><button class="btn btn-primary" data-act="view" data-v="carta">Ir a la carta</button></div>'
      + mailHTML();
    return;
  }
  const clave = p => p.vinoId ?? p.snap.nombre;
  const vinos = new Set(pages.map(clave)).size;
  const qs = new Set(pages.map(p => quincenaKey(new Date(p.fecha)))).size;
  const regs = new Set(pages.map(p => regionKey(p.snap.region)).filter(Boolean));
  const todas = [...new Set(carta.vinos.map(w => regionKey(w.region)).filter(Boolean).concat([...regs]))];
  const cepas = new Set(pages.map(p => p.snap.varietal).filter(Boolean)).size;
  const groups = [];
  pages.forEach(p => { const d = new Date(p.fecha), k = quincenaKey(d); let g = groups.find(x => x.k === k); if (!g) { g = {k, label: quincena(d) + ' de ' + d.getFullYear(), pages: []}; groups.push(g); } g.pages.push(p); });
  const n = ultimaNoche(pages);
  const conEmail = !!store.email;
  el.innerHTML = head
    + '<p class="cu-stats"><span><strong>' + pages.length + '</strong>' + (pages.length === 1 ? 'página' : 'páginas') + '</span><span><strong>' + vinos + '</strong>' + (vinos === 1 ? 'vino' : 'vinos') + '</span><span><strong>' + qs + '</strong>' + (qs === 1 ? 'quincena' : 'quincenas') + '</span></p></div>'
    + mailHTML()
    + '<section class="cu-sec noche" aria-label="Tu última noche"><div><p class="eyebrow">' + (n.esHoy ? 'Esta noche' : 'Tu última noche') + '</p><p class="noche-d">' + cap(fechaLarga(n.d)) + '</p></div><button class="btn btn-ghost sm" data-act="noche">Llevate tu noche</button>'
    + '<div class="noche-copas">' + n.pages.map(p => '<span class="nc" title="' + esc(p.snap.nombre) + '">' + copita(p.snap) + '<b>' + p.puntaje + '</b></span>').join('') + '</div></section>'
    + '<section class="cu-sec"><div class="sec-h"><p class="block-t">Tu paladar</p><span class="sec-s">sobre el mapa de esta carta</span></div>' + mapHTML({paladar: true}) + '<p class="paladar-f">' + frasePaladar() + '</p></section>'
    + groups.map(g => '<section class="cu-sec"><div class="sec-h"><p class="block-t">' + cap(g.label) + '</p><span class="sec-s">' + g.pages.length + ' ' + (g.pages.length === 1 ? 'página' : 'páginas') + '</span></div><div class="pages">' + g.pages.map(p => pageCard(p, {btn: true})).join('') + '</div></section>').join('')
    + (todas.length ? '<section class="cu-sec"><div class="sec-h"><p class="block-t">Sellos</p><span class="sec-s">' + regs.size + ' de ' + todas.length + ' regiones · ' + cepas + ' ' + (cepas === 1 ? 'cepa' : 'cepas') + '</span></div><div class="sellos">' + todas.map((r, i) => selloHTML(r, regs.has(r), i)).join('') + '</div></section>' : '')
    + '<div class="cu-foot">' + (ui.confirm === 'reset'
      ? '<p class="muted">' + (conEmail ? '¿Borrar las páginas de este celular? Las que se guardaron con tu email siguen en 125cc y vuelven si lo cargás de nuevo.' : '¿Borrar todas las páginas de este celular?') + '</p><div class="row-btns"><button class="btn btn-ghost sm" data-act="cancelar">Cancelar</button><button class="btn btn-danger sm" data-act="reset-si">Sí, borrar todo</button></div>'
      : '<button class="link muted-l" data-act="reset">Empezar de cero</button>')
    + '</div>';
}

/* ---------- Página abierta ---------- */
MODOS.pagina = S => {
  const p = store.pages.find(x => x.id === S.pageId);
  if (!p) { requestClose(); return {body: ''}; }
  const w = vinoDe(p);
  const enCarta = carta.vinos.some(x => x.id === p.vinoId);
  return {
    body: '<p class="eyebrow" id="sheet-title">Página del cuaderno</p><div class="block">' + pageCard(p) + '</div>'
      + revealAromas(p, w, true)
      + (p.perfil && w.perfil && w.perfil.cuerpo ? '<div class="block"><p class="block-t">En boca <span>vos y la ficha de la bodega</span></p>' + perfilCompare(p.perfil, w.perfil, w.tipo) + '</div>' : ''),
    foot: S.confirm
      ? '<div class="confirm"><p>¿Borrar esta página del cuaderno?</p><button class="btn btn-ghost sm" data-act="borrar-no">Cancelar</button><button class="btn btn-danger sm" data-act="borrar-si">Sí, borrar</button></div>'
      : '<button class="btn btn-ghost" data-act="borrar-pagina">Borrar</button><button class="btn btn-ghost" data-act="editar-pagina">Editar</button>' + (enCarta ? '<button class="btn btn-primary" data-act="ficha" data-id="' + p.vinoId + '">Ver el vino</button>' : '')
  };
};

async function guardarEmail(v){
  const btn = $('#mail-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  registrar('email_guardado', {paginas: store.pages.length});
  const n = await setEmail(v);
  renderCuaderno();
  toast(n ? 'Listo. Sumamos ' + n + (n === 1 ? ' cata que ya tenías.' : ' catas que ya tenías.') : 'Listo. Tu cuaderno queda guardado con tu email.');
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'mail-form') return;
  e.preventDefault();
  const v = $('#mail-in').value.trim();
  if (!EMAIL_RE.test(v)) { $('#mail-err').hidden = false; return; }
  guardarEmail(v);
});

Object.assign(ACT, {
  pagina: (t, v, id) => openSheet('pagina', {pageId: id}),
  'borrar-pagina': () => { ui.sheet.confirm = true; renderSheet(true); },
  'borrar-no': () => { ui.sheet.confirm = false; renderSheet(true); },
  'borrar-si': () => { const id = ui.sheet.pageId; borrarPagina(id); requestClose(); toast('Página borrada'); },
  reset: () => { ui.confirm = 'reset'; renderCuaderno(); },
  cancelar: () => { ui.confirm = null; renderCuaderno(); },
  'reset-si': () => { store.pages = []; ui.confirm = null; olvidarEmail(); save(); vistas.refresh(); toast('Cuaderno en blanco'); },
  'cambiar-email': () => { olvidarEmail(); renderCuaderno(); },
  'ir-cuaderno': () => { hideSheet(); vistas.mostrar('cuaderno'); },
});
