// tarjeta.js — "Llevate tu noche": una imagen de 1080×1920 (formato
// historia) con las copas de tu última noche y sus puntajes. Usa la foto
// real de cada botella (320w, pasada por /_vercel/image para que el canvas
// no quede bloqueado); si una foto no llega, va la copita dibujada.
// Para compartir: menú del teléfono si acepta archivos, si no, descarga.

import { ui, cap, fechaLarga, token, resolver, ACT, registrar } from './util.js';
import { TIPO } from './datos.js';
import { BOWL, HAND } from './dibujos.js';
import { cargarImagen } from './imagenes.js';
import { store, ultimaNoche } from './store.js';
import { MODOS, MODOS_DESPUES, openSheet, renderSheet, alCerrar } from './hoja.js';

const INSTAGRAM = '@125ccwinebar';
const DIRECCION = 'Hipólito Yrigoyen y San Lorenzo';

function wrapLines(g, text, max){
  const words = text.split(' '), lines = []; let cur = '';
  words.forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > max && cur) { lines.push(cur); cur = wd; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}
async function storyCanvas(n, conFotos){
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rows = n.pages.slice(0, 5), rowH = rows.length <= 3 ? 270 : 200;
  const [fotos] = await Promise.all([
    Promise.all(rows.map(p => conFotos && p.snap.imagen ? cargarImagen(p.snap.imagen, 320) : null)),
    Promise.race([Promise.all(['600 64px "Cormorant Garamond"', 'italic 500 64px "Cormorant Garamond"', '400 32px "DM Sans"', '600 32px "DM Sans"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {}),
  ]);
  const C = {bg1: token('--story-bg1'), bg2: token('--story-bg2'), cream: token('--story-cream'), soft: token('--story-soft'), oak: token('--story-oak'), ring: token('--story-ring')};
  const serif = '"Cormorant Garamond", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif';
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, C.bg2); gr.addColorStop(1, C.bg1);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(243,236,226,.06)'; g.lineWidth = 2;
  for (let y = 740; y < 1700; y += 64) { g.beginPath(); g.moveTo(90, y); g.lineTo(W - 90, y); g.stroke(); }
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.cream; g.font = '600 170px ' + serif; g.fillText('125', 84, 300);
  const w1 = g.measureText('125').width;
  g.fillStyle = C.oak; g.font = 'italic 500 170px ' + serif; g.fillText('cc', 84 + w1 + 6, 300);
  g.font = '600 28px ' + sans; if ('letterSpacing' in g) g.letterSpacing = '8px';
  g.fillText('WINE BAR · MAR DEL PLATA', 92, 362); if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.fillStyle = C.cream; g.font = 'italic 500 120px ' + serif; g.fillText(n.esHoy ? 'Mi noche' : 'Mi última noche', 84, 560);
  g.fillStyle = C.soft; g.font = '400 40px ' + sans; g.fillText(cap(fechaLarga(n.d)), 90, 628);
  let y = 750;
  const bowl = new Path2D(BOWL), stem = new Path2D('M12 15.5V25.5M7.5 27H16.5'), hand = new Path2D(HAND);
  rows.forEach((p, i) => {
    const img = fotos[i];
    if (img && img.naturalWidth) {
      // Botella real: alto de la fila, centrada donde iba la copita
      const h = rowH - 50, wd = Math.min(120, h * img.naturalWidth / img.naturalHeight), hh = wd * img.naturalHeight / img.naturalWidth;
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24; g.shadowOffsetY = 10;
      g.drawImage(img, 147 - wd / 2, y - 28 + (h - hh) / 2, wd, hh); g.restore();
    } else {
      g.save(); g.translate(90, y); g.scale(4.4, 4.4);
      g.fillStyle = resolver((TIPO[p.snap.tipo] || TIPO.Tinto).c); g.fill(bowl); g.strokeStyle = C.cream; g.lineWidth = .7; g.stroke(bowl);
      g.lineWidth = .9; g.lineCap = 'round'; g.stroke(stem); g.restore();
    }
    g.fillStyle = C.cream; g.font = '600 58px ' + serif;
    const lines = wrapLines(g, p.snap.nombre, 600).slice(0, 2);
    lines.forEach((l, k) => g.fillText(l, 232, y + 52 + k * 60));
    g.fillStyle = C.soft; g.font = '400 30px ' + sans;
    g.fillText([p.snap.bodega, p.snap.varietal].filter(Boolean).join(' · '), 234, y + 56 + lines.length * 60);
    g.save(); g.translate(890, y - 4); g.scale(2.3, 2.3); g.strokeStyle = C.ring; g.lineWidth = 2.2; g.lineCap = 'round'; g.stroke(hand); g.restore();
    g.fillStyle = C.cream; g.font = '700 62px ' + serif; g.textAlign = 'center'; g.fillText(String(p.puntaje), 890 + 73, y + 78); g.textAlign = 'left';
    y += rowH;
  });
  const conNota = rows.filter(p => p.nota).sort((a, b) => b.puntaje - a.puntaje)[0];
  if (conNota && y < 1500) {
    g.fillStyle = C.oak; g.fillRect(90, y + 20, 60, 3);
    g.fillStyle = C.cream; g.font = 'italic 500 50px ' + serif;
    wrapLines(g, '“' + conNota.nota + '”', 880).slice(0, 4).forEach((l, k) => g.fillText(l, 90, y + 110 + k * 64));
  }
  g.fillStyle = C.oak; g.font = '600 36px ' + sans; g.fillText(INSTAGRAM, 90, 1790);
  g.fillStyle = C.soft; g.font = '400 30px ' + sans; g.fillText(DIRECCION, 90, 1840);
  return c;
}
const aBlob = c => new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('sin imagen')), 'image/png'); } catch (e) { rej(e); } });
async function armarTarjeta(n){
  try { return await aBlob(await storyCanvas(n, true)); }
  catch (e) { return aBlob(await storyCanvas(n, false)); } // si alguna foto bloqueó el canvas, sin fotos
}

/* ---------- Hoja ---------- */
let urlActual = null;
alCerrar(() => { if (urlActual) { URL.revokeObjectURL(urlActual); urlActual = null; } });

MODOS.noche = S => {
  const pages = [...store.pages].sort((a, b) => b.fecha.localeCompare(a.fecha)), n = ultimaNoche(pages);
  const img = S.url
    ? '<img class="story-img" src="' + S.url + '" alt="Tarjeta de tu noche en 125cc con ' + n.pages.length + ' vinos y sus puntajes">'
    : S.error ? '<p class="muted">No se pudo armar la imagen en este navegador.</p>' : '<div class="story-ph">Armando la imagen…</div>';
  const sub = !S.url ? '' : S.compartible ? 'Compartila en tus historias o mandala por WhatsApp.' : 'Descargala, o mantené apretada la imagen para guardarla.';
  return {
    body: '<p class="eyebrow">Llevate tu noche</p><h2 class="h3" id="sheet-title">' + (n.esHoy ? 'Mi noche' : 'Mi última noche') + ' en 125cc</h2><div class="story-wrap">' + img + '</div>' + (sub ? '<p class="sub center">' + sub + '</p>' : ''),
    foot: !S.url ? '' : S.compartible
      ? '<button class="btn btn-primary" data-act="noche-compartir">Compartir</button>'
      : '<a class="btn btn-primary" href="' + S.url + '" download="mi-noche-125cc.png" data-act="noche-descargar">Descargar</a>'
  };
};
MODOS_DESPUES.noche = S => {
  if (S.armando || S.url || S.error) return;
  S.armando = true;
  const pages = [...store.pages].sort((a, b) => b.fecha.localeCompare(a.fecha)), n = ultimaNoche(pages);
  armarTarjeta(n).then(blob => {
    if (ui.sheet !== S) return;
    S.file = new File([blob], 'mi-noche-125cc.png', {type: 'image/png'});
    try { S.compartible = !!(navigator.canShare && navigator.canShare({files: [S.file]})); } catch (e) { S.compartible = false; }
    urlActual = S.url = URL.createObjectURL(blob);
    renderSheet(true);
  }).catch(() => { if (ui.sheet === S) { S.error = true; renderSheet(true); } });
};

Object.assign(ACT, {
  noche: () => {
    openSheet('noche');
    registrar('llevate_noche', {accion: 'abrir', paginas: ultimaNoche([...store.pages].sort((a, b) => b.fecha.localeCompare(a.fecha))).pages.length});
  },
  'noche-compartir': async () => {
    const S = ui.sheet; if (!S || !S.file) return;
    try {
      await navigator.share({files: [S.file], title: 'Mi noche en 125cc'});
      registrar('llevate_noche', {accion: 'compartir'});
    } catch (e) { /* canceló */ }
  },
  'noche-descargar': () => registrar('llevate_noche', {accion: 'descargar'}),
});
