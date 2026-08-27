// public/precio.js — fórmula de precio de copa desde el precio de góndola,
// para páginas que corren en el browser (se carga con <script src>, sin
// build step ni módulos). Espejo exacto de fmtPrecio()/precioBottella()
// en public/index.html.
//
// El precio de copa NUNCA se guarda en ningún lado — siempre se calcula
// al vuelo desde el precio de góndola del Sheet. Ya hay dos copias más de
// esta misma cuenta: la de public/index.html (donde nació) y la de
// api/_lib/pos/productos-import.js (Node, no puede cargar este archivo
// porque corre en el servidor, no en el browser). Si la fórmula cambia,
// cambia en LAS TRES — no hay forma de compartir código entre browser y
// Node sin un build step, y ese es justamente el que este proyecto evita
// a propósito. Este archivo solo evita la CUARTA copia (cuenta.html no
// necesita reimplementarla inline).

function precioBottella(p){
  if(!p) return 0;
  const clean = p.toString().replace(/\$/g,'').trim();
  const n = parseFloat(clean.replace(/,/g,''));
  return isNaN(n) ? 0 : n;
}

// Multiplicador por rango de botella:
// $10k–$13.999 → ×1.70 | $14k–$17.999 → ×1.60 | $18k–$29.999 → ×1.50 | $30k+ → ×1.25
function precioCopaNum(p){
  const botella = precioBottella(p);
  if(!botella) return 0;
  let factor = 1.50;
  if(botella < 14000)      factor = 1.70;
  else if(botella < 18000) factor = 1.60;
  else if(botella < 30000) factor = 1.50;
  else                     factor = 1.25;
  return Math.round(((botella / 6) * factor) / 500) * 500;
}

function fmtPrecio(p){
  const copa = precioCopaNum(p);
  return copa ? '$' + copa.toLocaleString('es-AR') : String(p ?? '');
}
