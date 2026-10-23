// util.js — utilidades chicas, estado de la interfaz y el registro de
// acciones que comparten todos los módulos de la carta nueva.

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt$ = n => n ? '$' + Number(n).toLocaleString('es-AR') : 'Consultá';
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const quincena = d => (d.getDate() <= 15 ? '1ª' : '2ª') + ' quincena de ' + MESES[d.getMonth()];
export const quincenaKey = d => d.getFullYear() + '-' + String(d.getMonth()).padStart(2, '0') + '-' + (d.getDate() <= 15 ? 1 : 2);
export const fechaCorta = d => DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
export const fechaLarga = d => DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
export const descr = n => n >= 95 ? 'Memorable' : n >= 90 ? 'Excelente' : n >= 86 ? 'Muy bueno' : n >= 80 ? 'Bueno' : n >= 72 ? 'Correcto' : 'No es para mí';

// Lee un token de tokens.css: tiempos (--ms-*, --dur-*) en milisegundos, o
// un color ya resuelto (para el canvas, que no entiende var()).
const css = () => getComputedStyle(document.documentElement);
export function ms(name){
  const v = css().getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return /ms$/.test(v) ? n : n * 1000;
}
export function token(name){ return css().getPropertyValue(name).trim(); }
// Tokens del tema noche aunque la persona esté en día (la tarjeta para
// compartir siempre es de noche). Se lee sin el atributo y se restaura en el
// mismo instante, sin que llegue a pintarse.
export function tokensNoche(names){
  const root = document.documentElement, t = root.getAttribute('data-theme');
  if (t) root.removeAttribute('data-theme');
  const cs = getComputedStyle(root), o = {};
  names.forEach(n => { o[n] = cs.getPropertyValue(n).trim(); });
  if (t) root.setAttribute('data-theme', t);
  return o;
}
// 'var(--tipo-tinto)' → '#8E1B2E'
export function resolver(c){ const m = /^var\((--[\w-]+)\)$/.exec(c || ''); return m ? token(m[1]) : c; }

export function haptic(n){ try { if (navigator.vibrate) navigator.vibrate(n || 8); } catch (e) {} }
const TOAST_MS = 2600; // cuánto queda a la vista (no es una animación)
let toastT;
export function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), TOAST_MS);
}

// Estado de la interfaz (no se guarda)
export const ui = {view: 'carta', filtro: 'Todos', faltan: false, sheet: null, cata: null, quiz: {step: -1, ans: {}}, confirm: null, cargada: false};

// Acciones por data-act: cada módulo suma las suyas, app.js las despacha.
export const ACT = {};
// Vistas: app.js completa estas funciones al arrancar (evita imports circulares).
export const vistas = { refresh(){}, mostrar(){}, badge(){} };

// Eventos de uso → /api/stats (tabla eventos_carta). Nunca frenan la UI.
let sesion = '';
try { sesion = sessionStorage.getItem('125cc-sesion') || ''; if (!sesion) { sesion = uid(); sessionStorage.setItem('125cc-sesion', sesion); } } catch (e) { sesion = uid(); }
export function registrar(evento, datos, vinoId){
  try {
    fetch('/api/stats', {
      method: 'POST', keepalive: true, headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({evento, vino_id: Number.isInteger(vinoId) ? vinoId : null, sesion, datos: datos || null}),
    }).catch(() => {});
  } catch (e) {}
}
