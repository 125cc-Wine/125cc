// api/_lib/quitar-fondo.js — Recorte de fondo por chroma-key sobre blanco.
//
// Las fotos de producto que traen las bodegas/distribuidores son casi
// siempre estudio con fondo blanco liso (cyclorama), sin sombra proyectada
// fuerte — se confirmó a ojo en varias muestras reales del catálogo. Por
// eso alcanza con un recorte por color en vez de un modelo de IA de
// segmentación — cero costo, cero API key, corre en la misma función
// serverless con `sharp`.
//
// No alcanza con "todo pixel casi blanco → transparente" a secas: las
// etiquetas suelen tener zonas de papel claro (crema/marfil) que caen
// dentro del mismo umbral y quedarían agujereadas. Por eso el recorte hace
// flood-fill desde el BORDE de la imagen hacia adentro — sólo el blanco que
// está conectado al fondo real se vuelve transparente; el blanco "de isla"
// que queda encerrado por la botella (etiqueta, contraetiqueta) nunca se
// toca aunque tenga el mismo color.
//
// Si la imagen ya viene con transparencia (ej. las que el proveedor ya
// procesó con Photoroom), se respeta: la nueva alpha es el mínimo entre la
// original y la calculada acá, así nunca se vuelve MÁS opaca.
const sharp = require('sharp');

// Umbrales en escala 0-255 / 0-1. "Duro": a partir de acá es 100% transparente.
// "Blando": entre BLANDO y DURO se interpola (feather) para que el borde de
// la botella no quede con un cerco duro tipo "recortado con tijera". El
// mismo par de umbrales se usa para decidir hasta dónde se expande el
// flood-fill, así nunca queda una isla opaca "de fondo" que el feather no
// sepa qué alpha darle.
const BRILLO_DURO    = 246;
const BRILLO_BLANDO  = 222;
const SATURACION_MAX = 0.06; // 0-1 — descarta colores (vidrio verde, etiqueta) aunque sean claros

// Lado máximo (px) antes de procesar — las fotos de tienda suelen venir en
// "-scaled" a 2000px+ y acá nunca se muestran a más de unos cientos de px.
// Redimensionar antes del flood-fill también acelera el recorte.
const LADO_MAXIMO = 1600;

function esFondoCandidato(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brillo = (r + g + b) / 3;
  const saturacion = max === 0 ? 0 : (max - min) / max;
  return brillo >= BRILLO_BLANDO && saturacion <= SATURACION_MAX;
}

function alphaPorBrillo(r, g, b) {
  const brillo = (r + g + b) / 3;
  if (brillo >= BRILLO_DURO) return 0;
  if (brillo >= BRILLO_BLANDO) {
    const t = (brillo - BRILLO_BLANDO) / (BRILLO_DURO - BRILLO_BLANDO);
    return Math.round(255 * (1 - t));
  }
  return 255;
}

function quitarFondoBlanco(rawBuffer, info) {
  const { width, height, channels } = info; // channels === 4 (RGBA) por ensureAlpha()
  const out = Buffer.from(rawBuffer); // copia — vamos a mutar sólo el canal alpha
  const total = width * height;

  const visitado = new Uint8Array(total);
  const esFondo   = new Uint8Array(total);
  const cola      = new Int32Array(total);
  let colaIni = 0, colaFin = 0;

  const colorEnIdx = (idx) => {
    const p = idx * channels;
    return [out[p], out[p + 1], out[p + 2]];
  };

  const semilla = (idx) => {
    if (visitado[idx]) return;
    visitado[idx] = 1;
    const [r, g, b] = colorEnIdx(idx);
    if (esFondoCandidato(r, g, b)) { esFondo[idx] = 1; cola[colaFin++] = idx; }
  };

  // Semillas: todo el perímetro de la imagen (el fondo real siempre toca el borde
  // en una foto de producto centrada; el objeto nunca llega hasta el borde).
  for (let x = 0; x < width; x++) { semilla(x); semilla((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { semilla(y * width); semilla(y * width + width - 1); }

  while (colaIni < colaFin) {
    const idx = cola[colaIni++];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) semilla(idx - 1);
    if (x < width - 1) semilla(idx + 1);
    if (y > 0) semilla(idx - width);
    if (y < height - 1) semilla(idx + width);
  }

  for (let idx = 0; idx < total; idx++) {
    if (!esFondo[idx]) continue;
    const p = idx * channels;
    const aCalculada = alphaPorBrillo(out[p], out[p + 1], out[p + 2]);
    out[p + 3] = Math.min(out[p + 3], aCalculada);
  }

  return sharp(out, { raw: { width, height, channels } }).png({ compressionLevel: 9 });
}

// Recibe los bytes crudos de la imagen descargada (jpg/png/webp/lo que sea
// que soporte sharp) y devuelve un Buffer PNG con el fondo blanco recortado.
async function recortarFondoBlanco(bytes) {
  const { data, info } = await sharp(bytes)
    .rotate() // respeta EXIF orientation antes de leer píxeles crudos
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return quitarFondoBlanco(data, info).toBuffer();
}

module.exports = { recortarFondoBlanco };
