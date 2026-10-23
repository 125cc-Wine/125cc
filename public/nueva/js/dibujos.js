// dibujos.js — los SVG dibujados del prototipo: copita del mapa, copa con
// nivel, mancha de color, círculo a mano del puntaje e íconos.

import { TIPO } from './datos.js';

let svgUid = 0;
export const nuevoId = p => p + (++svgUid);

export const ICON_ASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>';
export const ICON_GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 2.6 1.2 2.2 2.8L12.5 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>';
export const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 8c-1.7 0-2.6-1.2-2.2-2.8l.7-3.2H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17"/></svg>';
export const HAND = 'M35 5C51 5 61 15 59 30C57 45 43 52 29 51C14 50 4 41 5 27C6 13 18 5 37 7';
export const handCircle = () => '<svg class="hand" viewBox="0 0 64 56" aria-hidden="true"><path d="' + HAND + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const BOWL = 'M4 2H20C20 11 17 15.5 12 15.5C7 15.5 4 11 4 2Z';
export const GLASS_ICON = '<svg viewBox="0 0 80 110" aria-hidden="true"><path d="M14 6H66C66 44 54 62 40 62C26 62 14 44 14 6Z" fill="none" stroke="var(--roble)" stroke-width="2"/><path d="M17 30H63C61 50 52 59 40 59C28 59 19 50 17 30Z" fill="var(--tinto)"/><path d="M40 62V98M26 102H54" fill="none" stroke="var(--roble)" stroke-width="2.2" stroke-linecap="round"/></svg>';

// w: un vino o el snapshot de una página (tipo y n). Sin número (vino que
// ya salió de carta) la copita va vacía. El vino se oscurece hacia abajo y
// el vidrio lleva un reflejo blanco en el costado izquierdo del cáliz.
export function copita(w){
  const t = TIPO[w.tipo] || TIPO.Tinto, id = nuevoId('cp');
  return '<svg viewBox="0 0 24 30" class="copita" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient></defs>'
    + '<path d="' + BOWL + '" fill="' + t.c + '"/><path d="' + BOWL + '" fill="url(#' + id + ')" stroke="var(--ink)" stroke-width="1"/>'
    + '<path d="M6.3 4.4C6.5 8.8 7.5 11.9 9.6 13.6" fill="none" stroke="#FFF" stroke-opacity=".35" stroke-width="1.1" stroke-linecap="round"/>'
    + '<path d="M12 15.5V25.5M7.5 27H16.5" fill="none" stroke="var(--ink)" stroke-width="1.3" stroke-linecap="round"/>'
    + (w.n != null ? '<text x="12" y="10.7" text-anchor="middle" font-size="8.2" font-weight="700" font-family="DM Sans, sans-serif" fill="' + t.ink + '">' + w.n + '</text>' : '') + '</svg>';
}

// Íconos de los datos de la ficha (18 px, línea de 1.6)
const ico = d => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
export const ICONOS_DATO = {
  'Región': ico('<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  'Altitud': ico('<path d="M2.5 19.5 9 8l4 6.5 2.5-3.5 6 8.5z"/><path d="M7.2 11.2 9 12.4l1.8-1.2"/>'),
  'Suelo': ico('<path d="M3 7.5c3-1.6 6 1.6 9 0s6 1.6 9 0M3 12.5c3-1.6 6 1.6 9 0s6 1.6 9 0M3 17.5c3-1.6 6 1.6 9 0s6 1.6 9 0"/>'),
  'Varietal': ico('<path d="M12 6V3.2c1.4-.5 2.9-.2 4 .9"/><circle cx="8" cy="9" r="2.2"/><circle cx="12.4" cy="9" r="2.2"/><circle cx="16.8" cy="9" r="2.2"/><circle cx="10.2" cy="13.2" r="2.2"/><circle cx="14.6" cy="13.2" r="2.2"/><circle cx="12.4" cy="17.4" r="2.2"/>'),
  'Crianza': ico('<path d="M7 3.5h10c1.5 2.6 2 5.6 2 8.5s-.5 5.9-2 8.5H7c-1.5-2.6-2-5.6-2-8.5s.5-5.9 2-8.5z"/><path d="M5.6 8h12.8M5.6 16h12.8"/>'),
  'Temperatura': ico('<path d="M10 14.3V5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 9v7.5"/>'),
  'Copa': ico('<path d="M7 3h10c0 5.5-2.2 8.5-5 8.5S7 8.5 7 3z"/><path d="M12 11.5V19M8.5 21h7"/>'),
};
export function copaNivel(f, color){
  const id = nuevoId('cn'), y = (24 - 20 * f).toFixed(1);
  const bowl = 'M6 4H26C26 17 22 24 16 24C10 24 6 17 6 4Z';
  return '<svg viewBox="0 0 32 40" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + bowl + '"/></clipPath></defs><rect x="0" y="' + y + '" width="32" height="30" fill="' + color + '" clip-path="url(#' + id + ')"/><path d="' + bowl + '" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 24V34M11 36H21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}
export function blot(hex){
  return '<svg viewBox="0 0 60 56" aria-hidden="true"><path d="M31 5C44 3 56 12 56 26C57 40 46 51 32 51C18 52 6 44 5 30C4 17 16 7 31 5Z" fill="' + hex + '"/><ellipse cx="23" cy="20" rx="9" ry="5" fill="#FFFFFF" opacity=".16" transform="rotate(-25 23 20)"/><circle cx="54" cy="48" r="3" fill="' + hex + '"/></svg>';
}
export function arc(cx, cy, r0, r1, a0, a1){
  const p = (r, a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const A = p(r1, a0), B = p(r1, a1), C = p(r0, a1), D = p(r0, a0);
  const f = n => n.toFixed(2);
  return 'M' + f(A[0]) + ' ' + f(A[1]) + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + f(B[0]) + ' ' + f(B[1]) + 'L' + f(C[0]) + ' ' + f(C[1]) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + f(D[0]) + ' ' + f(D[1]) + 'Z';
}
export const dots = (v, cls) => '<span class="dots ' + (cls || '') + '" role="img" aria-label="' + (v || 0) + ' de 5">' + [1,2,3,4,5].map(i => '<i class="' + (i <= v ? 'on' : '') + '" style="--i:' + (i - 1) + '"></i>').join('') + '</span>';
