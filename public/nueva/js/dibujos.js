// dibujos.js — los SVG dibujados del prototipo: copita del mapa, copa con
// nivel, mancha de color, círculo a mano del puntaje e íconos.

import { TIPO } from './datos.js';

let svgUid = 0;
export const nuevoId = p => p + (++svgUid);

export const ICON_ASK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>';
export const ICON_GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8c1.7 0 2.6 1.2 2.2 2.8L12.5 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/></svg>';
export const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 13V4h3v9zM17 13l-4 8c-1.7 0-2.6-1.2-2.2-2.8l.7-3.2H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17"/></svg>';
export const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88a9.86 9.86 0 0 1 9.88 9.89c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41"/></svg>';
export const HAND = 'M35 5C51 5 61 15 59 30C57 45 43 52 29 51C14 50 4 41 5 27C6 13 18 5 37 7';
export const handCircle = () => '<svg class="hand" viewBox="0 0 64 56" aria-hidden="true"><path d="' + HAND + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
export const BOWL = 'M4 2H20C20 11 17 15.5 12 15.5C7 15.5 4 11 4 2Z';
export const GLASS_ICON = '<svg viewBox="0 0 80 110" aria-hidden="true"><path d="M14 6H66C66 44 54 62 40 62C26 62 14 44 14 6Z" fill="none" stroke="var(--oak)" stroke-width="2"/><path d="M17 30H63C61 50 52 59 40 59C28 59 19 50 17 30Z" fill="var(--tinto)"/><path d="M40 62V98M26 102H54" fill="none" stroke="var(--oak)" stroke-width="2.2" stroke-linecap="round"/></svg>';

// w: un vino o el snapshot de una página (tipo y n). Sin número (vino que
// ya salió de carta) la copita va vacía.
export function copita(w){
  const t = TIPO[w.tipo] || TIPO.Tinto;
  return '<svg viewBox="0 0 24 30" class="copita" aria-hidden="true"><path d="' + BOWL + '" fill="' + t.c + '" stroke="var(--glass-edge)" stroke-width="1"/><path d="M12 15.5V25.5M7.5 27H16.5" fill="none" stroke="var(--glass-edge)" stroke-width="1.3" stroke-linecap="round"/>'
    + (w.n != null ? '<text x="12" y="10.7" text-anchor="middle" font-size="8.2" font-weight="700" font-family="DM Sans, sans-serif" fill="' + t.ink + '">' + w.n + '</text>' : '') + '</svg>';
}
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
export const dots = (v, cls) => '<span class="dots ' + (cls || '') + '" role="img" aria-label="' + (v || 0) + ' de 5">' + [1,2,3,4,5].map(i => '<i class="' + (i <= v ? 'on' : '') + '"></i>').join('') + '</span>';
