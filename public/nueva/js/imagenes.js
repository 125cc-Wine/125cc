// imagenes.js — fotos de botella servidas por la optimización de imágenes
// de Vercel (/_vercel/image, configurada en vercel.json → "images") y el
// dibujo de botella del prototipo como respaldo cuando no hay foto o falla.
// La lista de la carta baja solo miniaturas (96w/192w, lazy); la foto
// grande (640w) se pide recién al abrir el vino. El mapa no carga fotos.
//
// Las fotos son PNG transparentes con lienzos distintos (cuadrados, 2:3,
// 1:2): se dimensionan por el alto con ancho automático y centradas, nunca
// con object-fit en una caja fija (un lienzo cuadrado dejaría la botella
// diminuta). Lo que sobra a los costados es transparente.

import { esc } from './util.js';
import { TIPO } from './datos.js';
import { nuevoId } from './dibujos.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export function foto(url, w) {
  if (!url) return null;
  if (LOCAL) return url; // en local no hay optimizador
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}

function splitName(s){
  if (s.length <= 10 || s.indexOf(' ') < 0) return [s];
  const words = s.split(' '); let best = [s], diff = 1e9;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < diff) { diff = d; best = [a, b]; }
  }
  return best;
}
export function bottleSVG(w){
  const id = nuevoId('bt');
  const clear = w.tipo !== 'Tinto';
  const burg = clear || /Pinot|Criolla/.test(w.varietal || '');
  const d = burg
    ? 'M25 6H35V48C35 74 53 88 53 114V187Q53 194 46 194H14Q7 194 7 187V114C7 88 25 74 25 48Z'
    : 'M24 6H36V56C36 69 53 70 53 85V187Q53 194 46 194H14Q7 194 7 187V85C7 70 24 69 24 56Z';
  const glass = clear ? '#DCE5DA' : '#1E2A23';
  const cap = w.tipo === 'Tinto' ? '#5E0F1F' : w.tipo === 'Rosado' ? '#C98A7A' : '#B89656';
  const lines = splitName((w.bodega || '').toUpperCase());
  const ly = lines.length === 1 ? [146] : [141.5, 149.5];
  const v = w.varietal || '';
  const varietal = v.length > 15 ? v.split(' ')[0] : v;
  return '<svg viewBox="0 0 60 200" class="bottle" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="' + d + '"/></clipPath></defs>'
    + '<path d="' + d + '" fill="' + glass + '"' + (clear ? ' fill-opacity=".6"' : '') + '/>'
    + (clear ? '<rect x="0" y="' + (burg ? 102 : 84) + '" width="60" height="120" fill="' + (TIPO[w.tipo] || TIPO.Tinto).c + '" opacity=".9" clip-path="url(#' + id + ')"/>' : '')
    + '<rect x="10.5" y="90" width="4.5" height="96" rx="2" fill="#FFFFFF" opacity=".16" clip-path="url(#' + id + ')"/>'
    + '<path class="edge" d="' + d + '"/>'
    + '<rect x="23" y="4" width="14" height="' + (burg ? 30 : 34) + '" rx="2" fill="' + cap + '"/>'
    + '<rect x="10" y="124" width="40" height="44" rx="2" fill="#F4EDE0"/>'
    + '<line x1="14" y1="131" x2="46" y2="131" stroke="#C8A46A" stroke-width=".6"/>'
    + '<line x1="14" y1="163" x2="46" y2="163" stroke="#C8A46A" stroke-width=".6"/>'
    + lines.map((t, i) => '<text x="30" y="' + ly[i] + '" text-anchor="middle" font-family="DM Sans, sans-serif" font-weight="700" font-size="5.2" letter-spacing=".5" fill="#2A2420"' + (t.length > 9 ? ' textLength="34" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(t) + '</text>').join('')
    + '<text x="30" y="158" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-weight="600" font-size="6.6" fill="#7A1428">' + esc(varietal) + '</text>'
    + '</svg>';
}

// Foto real con srcset, o el dibujo si el vino no tiene imagen. width/height
// reservan el lugar mientras carga. opts: {ws: [anchos], sizes, width,
// height, lazy, deco} — deco: alt vacío (el reflejo, o la miniatura de una
// fila que ya dice el nombre al lado).
const respaldos = new Map(); // id del <img> → vino, para dibujarlo si la foto falla
export function fotoBotella(w, opts){
  if (!w.imagen) return bottleSVG(w);
  const ws = opts.ws;
  const id = nuevoId('ft');
  respaldos.set(id, w);
  return '<img class="foto" id="' + id + '" alt="' + (opts.deco ? '' : 'Botella de ' + esc(w.nombre)) + '"'
    + ' src="' + esc(foto(w.imagen, ws[0])) + '"'
    + (LOCAL ? '' : ' srcset="' + ws.map(n => esc(foto(w.imagen, n)) + ' ' + n + 'w').join(', ') + '" sizes="' + opts.sizes + '"')
    + ' width="' + opts.width + '" height="' + opts.height + '" decoding="async"' + (opts.lazy ? ' loading="lazy"' : '') + '>';
}
const halo = w => (TIPO[w.tipo] || TIPO.Tinto).c;

// La botella en escena (página del vino, ¿Qué tomo?): un foco de luz del
// color del tipo atrás, la botella, su reflejo en el piso (la misma imagen
// dada vuelta, que se apaga hacia abajo) y la sombra de la base. Lo mismo
// con el dibujo de respaldo. chica: la versión de 120 px.
export function escenaBotella(w, opts, chica){
  return '<div class="escena' + (chica ? ' chica' : '') + '" style="--halo:' + halo(w) + '">'
    + '<span class="escena-halo"></span><span class="escena-vino">'
    + '<span class="escena-botella">' + fotoBotella(w, opts) + '</span>'
    + '<span class="escena-reflejo" aria-hidden="true">' + fotoBotella(w, Object.assign({}, opts, {deco: true})) + '</span>'
    + '<span class="escena-sombra"></span></span></div>';
}

// Miniatura de la lista: la botella en su nicho con foco de luz, y el
// número de carta como insignia en la esquina.
export function nicho(w, opts){
  const t = TIPO[w.tipo] || TIPO.Tinto;
  return '<span class="nicho" style="--halo:' + t.c + '"><span class="nicho-luz">'
    + fotoBotella(w, Object.assign({ws: [96, 192], sizes: '64px', width: 44, height: 64, lazy: true, deco: true}, opts)) + '</span>'
    + (w.n != null ? '<span class="nicho-n" style="background:' + t.c + ';color:' + t.ink + '">' + w.n + '</span>' : '') + '</span>';
}

// Un solo escuchador para todas las fotos: si una falla, va el dibujo.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('foto')) return;
  const w = respaldos.get(img.id);
  if (w) img.outerHTML = bottleSVG(w);
}, true);

// Para el canvas de "Llevate tu noche": pasa por /_vercel/image, que es del
// mismo dominio, así el canvas no queda bloqueado. null si no carga a tiempo.
export function cargarImagen(url, w){
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), 5000);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = foto(url, w);
  });
}
