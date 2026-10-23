// somm.js — ¿Qué tomo?: cuatro preguntas y tres copas de la carta, con la
// lógica del prototipo más el voto arriba/abajo de cada recomendación
// (guardado en el celular como marcarFeedbackSomm() de la carta actual, y
// registrado como evento somm_voto en /api/stats).

import { $, ui, esc, fmt$, cap, reduced, ms, ACT, haptic, registrar } from './util.js';
import { carta } from './datos.js';
import { ICON_GO, ICON_UP, ICON_DOWN, GLASS_ICON } from './dibujos.js';
import { fotoBotella } from './imagenes.js';
import { store, ultimaPagina, paladar } from './store.js';

// Franjas de precio por tercios de la carta real, como precioBandThresholds()
// de la carta actual (el prototipo las tenía escritas a mano).
function bandas(){
  const copas = carta.vinos.map(w => w.copa).filter(c => c > 0).sort((a, b) => a - b);
  if (!copas.length) return {min: 0, low: 0, high: 0, max: 0};
  return {min: copas[0], low: copas[Math.floor(copas.length / 3)] || copas[0], high: copas[Math.floor(copas.length * 2 / 3)] || copas[copas.length - 1], max: copas[copas.length - 1]};
}
const rango = (a, b) => a === b ? 'Copas de ' + fmt$(a) : 'Copas de ' + fmt$(a) + ' a ' + fmt$(b);
function quiz(){
  const b = bandas();
  const medios = carta.vinos.map(w => w.copa).filter(c => c > b.low && c <= b.high).sort((x, y) => x - y);
  return [
    {k:'color', t:'¿Qué color te llama hoy?', s:'Lo que más se te antoje.', o:[['tinto','Tinto','Con cuerpo y carácter'],['claro','Blanco o rosado','Fresco y liviano'],['sorpresa','Sorprendeme','Algo que no pedirías']]},
    {k:'animo', t:'¿Cómo lo querés?', s:'Pensá en el ánimo de esta noche.', o:[['fresco','Fresco y fácil','Que entre solo'],['estructura','Con estructura','Para tomarlo despacio'],['igual','Me da igual','Que combine con lo que haya']]},
    {k:'comida', t:'¿Va con algo para comer?', s:'Así acertamos con el maridaje.', o:[['tabla','Tabla o charcutería','Quesos, jamón, fiambres'],['solo','Solo, por ahora','Sin comida'],['contundente','Algo más contundente','Carnes o quesos duros']]},
    {k:'precio', t:'¿Cuánto querés invertir?', s:'Todos los vinos de la carta están elegidos.', o:[
      ['accesible','Lo más accesible', b.min ? rango(b.min, b.low) : 'Los de entrada de la carta'],
      ['medio','Precio medio', medios.length ? rango(medios[0], medios[medios.length - 1]) : 'Entre los más pedidos'],
      ['top','Lo mejor de la carta','Esta noche me doy un gusto']]}
  ];
}

const FB_KEY = '125cc_somm_feedback'; // la misma clave que la carta actual
function leerFeedback(){ try { return JSON.parse(localStorage.getItem(FB_KEY) || '{}') || {}; } catch (e) { return {}; } }

function recomendar(ans){
  const {low, high} = bandas();
  const pMax = Math.max(...carta.vinos.map(w => w.copa));
  const z = paladar(), fb = leerFeedback();
  return carta.vinos.map(w => {
    let s = 0; const why = []; const p = w.perfil, m = w.maridaje.join(' ').toLowerCase();
    if (ans.color === 'tinto') s += w.tipo === 'Tinto' ? 3 : -5;
    else if (ans.color === 'claro') s += w.tipo === 'Tinto' ? -5 : 3;
    else if (w.tipo !== 'Tinto' || /Criolla|Franc|Syrah/.test(w.varietal)) { s += 2; why.push(w.tipo !== 'Tinto' ? 'un ' + w.tipo.toLowerCase() + ' para salir de lo de siempre' : 'una cepa que no se pide tanto'); }
    if (ans.animo === 'fresco') { s += (p.frescura - 3) * 1.3 - (p.cuerpo - 3) * .9; if (p.frescura >= 4) why.push('fresco y fácil de tomar'); }
    else if (ans.animo === 'estructura') { s += (p.cuerpo - 3) * 1.3 + (p.taninos - 3) * .7; if (p.cuerpo >= 4) why.push('tiene cuerpo y estructura'); }
    if (ans.comida === 'tabla') { if (/queso|embutid|charcut|picada|fiambre|jam|tabla|salame/.test(m)) { s += 1.5; why.push('va muy bien con la tabla'); } }
    else if (ans.comida === 'contundente') { if (/carne|cordero|caza|guiso|cerdo|asado/.test(m)) { s += 1.5; why.push('acompaña carnes y platos intensos'); } }
    else if (ans.comida === 'solo' && p.cuerpo <= 3) { s += .8; why.push('se disfruta solo'); }
    if (ans.precio === 'accesible') s += w.copa <= low ? 2 : w.copa <= high ? -.5 : -3;
    else if (ans.precio === 'medio') s += w.copa > low && w.copa <= high ? 2 : w.copa <= low ? .3 : -1;
    else { s += w.copa > high ? 2 : -.8; if (w.copa === pMax) { s += .8; why.push('es lo más especial de la carta'); } }
    const probado = !!ultimaPagina(w.id);
    if (z && !probado) { const d = Math.hypot(w.x - z.X, w.y - z.Y); if (d < 70) { s += 1.2 * (1 - d / 70); why.push('queda cerca de lo que te viene gustando'); } }
    if (probado) s -= .6;
    if (fb[w.id] === 'like') s += 1;
    else if (fb[w.id] === 'dislike') s -= 3;
    return {w, s, why};
  }).sort((a, b) => b.s - a.s).slice(0, 3).map(r => {
    const u = [...new Set(r.why)].slice(0, 2);
    const ar = (r.w.aromas_somm || []).slice(0, 2);
    const notas = ar.length ? ' Notas de ' + ar.join(' y ') + '.' : '';
    return {w: r.w, why: (u.length ? cap(u.join(', ')) + '.' : 'Equilibrado y fácil de acompañar.') + notas};
  });
}

function votoHTML(id, fb){
  return '<div class="rec-vote"><span>¿Te sirve?</span>'
    + '<button data-act="somm-voto" data-id="' + id + '" data-v="like" aria-pressed="' + (fb[id] === 'like') + '" aria-label="Me sirve">' + ICON_UP + '</button>'
    + '<button data-act="somm-voto" data-id="' + id + '" data-v="dislike" aria-pressed="' + (fb[id] === 'dislike') + '" aria-label="No me convence">' + ICON_DOWN + '</button></div>';
}

export function renderQueTomo(){
  const q = ui.quiz, el = $('#view-que-tomo'), QUIZ = quiz();
  if (q.step === -1) {
    el.innerHTML = '<div class="qt-intro">' + GLASS_ICON
      + '<p class="t-eyebrow eyebrow">Un sommelier en tu mesa</p><h1 class="t-titulo-xl titulo">¿Qué tomo?</h1><p class="sub">Cuatro preguntas y te sugiero tres copas de la carta de esta quincena' + (paladar() ? ', teniendo en cuenta lo que ya anotaste' : '') + '.</p>'
      + '<button class="t-boton btn btn-primary wide" data-act="quiz-start"' + (carta.vinos.length ? '' : ' disabled') + '>Ayudame a elegir</button><p class="qt-note">Si preferís charlarlo, el sommelier está en el salón.</p></div>';
    return;
  }
  if (q.step === 'pensando') {
    el.innerHTML = '<div class="thinking">' + GLASS_ICON + '<p>Buscando en la carta…</p></div>';
    return;
  }
  if (q.step < QUIZ.length) {
    const Q = QUIZ[q.step];
    el.innerHTML = '<div class="qt-prog">' + QUIZ.map((_, i) => '<i class="' + (i <= q.step ? 'on' : '') + '"></i>').join('') + '<span>' + (q.step + 1) + ' de ' + QUIZ.length + '</span></div>'
      + (q.step > 0 ? '<button class="link back" data-act="quiz-back">← Volver</button>' : '<div class="back-sp"></div>')
      + '<h2 class="t-titulo-l titulo">' + Q.t + '</h2><p class="sub">' + Q.s + '</p>'
      + '<div class="opts">' + Q.o.map(([v, t, s]) => '<button class="opt" data-act="quiz-ans" data-v="' + v + '" aria-pressed="' + (q.ans[Q.k] === v) + '"><span class="opt-t">' + t + '</span><span class="opt-s">' + esc(s) + '</span><span class="opt-go">' + ICON_GO + '</span></button>').join('') + '</div>';
    return;
  }
  // Las recomendaciones se calculan una vez: votar no las reordena en pantalla
  if (!q.recs) {
    q.recs = recomendar(q.ans);
    registrar('quiz_resultado', {respuestas: q.ans, vinos: q.recs.map(r => r.w.id)});
  }
  const fb = leerFeedback();
  const res = QUIZ.map(Q => { const o = Q.o.find(x => x[0] === q.ans[Q.k]); return o ? o[1] : ''; }).filter(Boolean).join(' · ');
  el.innerHTML = '<p class="t-eyebrow eyebrow">Para esta noche</p><h1 class="t-titulo-xl titulo">Tus tres copas</h1><p class="sub">' + esc(res) + '</p>'
    + '<ol class="recs">' + q.recs.map((r, i) => '<li class="rec-li"><button class="rec" data-act="ficha" data-id="' + r.w.id + '"><span class="rec-rank">' + (i + 1) + '</span><span class="rec-main"><span class="rec-name">' + esc(r.w.nombre) + '</span><span class="rec-why">' + esc(r.why) + '</span><span class="rec-meta">' + esc(r.w.varietal) + ' · ' + fmt$(r.w.copa) + (store.pages.length && !ultimaPagina(r.w.id) ? ' · todavía no lo probaste' : '') + '</span></span><span class="rec-b">' + fotoBotella(r.w, {ws: [96, 192], sizes: '40px', width: 40, height: 84, lazy: true}) + '</span></button>' + votoHTML(r.w.id, fb) + '</li>').join('') + '</ol>'
    + '<div class="row-btns"><button class="t-boton btn btn-ghost" data-act="quiz-reset">Volver a empezar</button></div>';
}

Object.assign(ACT, {
  'quiz-start': () => { ui.quiz = {step: 0, ans: {}}; renderQueTomo(); window.scrollTo(0, 0); },
  'quiz-ans': (t, v) => {
    const q = ui.quiz, QUIZ = quiz(); q.ans[QUIZ[q.step].k] = v; haptic();
    if (q.step < QUIZ.length - 1) { q.step++; renderQueTomo(); window.scrollTo(0, 0); return; }
    q.step = 'pensando'; q.recs = null; renderQueTomo();
    setTimeout(() => { if (ui.quiz.step === 'pensando') { ui.quiz.step = QUIZ.length; renderQueTomo(); window.scrollTo(0, 0); } }, reduced() ? 0 : ms('--dur-trazo'));
  },
  'quiz-back': () => { ui.quiz.step = Math.max(0, ui.quiz.step - 1); renderQueTomo(); },
  'quiz-reset': () => { ui.quiz = {step: 0, ans: {}}; renderQueTomo(); window.scrollTo(0, 0); },
  // Tocar el mismo botón de nuevo lo saca (igual que marcarFeedbackSomm)
  'somm-voto': (t, v, id) => {
    const fb = leerFeedback();
    const nuevo = fb[id] === v ? null : v;
    if (nuevo) fb[id] = nuevo; else delete fb[id];
    try { localStorage.setItem(FB_KEY, JSON.stringify(fb)); } catch (e) {}
    t.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === nuevo)));
    registrar('somm_voto', {valor: nuevo || 'quitado', respuestas: ui.quiz.ans}, +id);
    haptic();
  },
});
