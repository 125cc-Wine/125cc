#!/usr/bin/env node
// scripts/completar-fichas-quincena-nov1.js — Corrida puntual: completa
// tienda_url/imagen/nota/maridaje/perfil_* de 12 de los 13 vinos de la
// Quincena 1 de noviembre 2026 (arranca 01/11). Fuente: ficha técnica real
// de cada producto en aromadevid.com.ar.
//
// ⚠️ "Amauta Cabernet Franc" QUEDA AFUERA de este script — no está en el
// catálogo actual de aromadevid.com.ar (sólo tienen "Amauta Absoluto
// Torrontés" de esa bodega). El producto real parece ser un corte Cabernet
// Franc-Malbec de Bodega El Porvenir de Cafayate (líneas "Corte IV
// Innovación"/"Reflexión"), pero no está confirmado que la distribuidora
// lo tenga o lo vaya a tener para esa fecha — falta casi 2 meses, conviene
// confirmar disponibilidad más cerca en vez de adivinar ahora.
//
// El Peral Sauv. Blanc Uruco y Trivento Established Semillón tienen ficha
// pobre en el sitio — nota más corta, perfil_* por criterio de varietal
// típico en vez de datos de cata puntuales.
//
// perfil_* revisado a mano contra colisiones de mapa — hubo un choque de
// 3 y uno de 2, resueltos con detalle real de cada ficha.
//
// Uso: node scripts/completar-fichas-quincena-nov1.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: '2456 Sangiovese',
    tienda_url: 'https://www.aromadevid.com.ar/producto/2456-sangiovese-reserva/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/image-Photoroom-78.png',
    nota: 'Sangiovese de Medrano, Junín — cereza y frutilla con tabaco sutil, especias suaves y un dejo de chocolate. Entrada fresca y balanceada, con la acidez marcada típica del varietal y taninos finos y sedosos.',
    maridaje: 'pastas con salsa de tomate, pizza a la piedra, carnes a la parrilla, cocina mediterránea, quesos semiduros', cuerpo: 3, frescura: 5, taninos: 2 },
  { nombre: 'Atamisque Cabernet Sauvignon Atamisque',
    tienda_url: 'https://www.aromadevid.com.ar/producto/atamisque-cabernet-sauvignon/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/AtamisqueCS2025.png',
    nota: 'Cabernet Sauvignon de Valle de Uco de la propia Atamisque — mermelada de fruta roja, pimienta y un carácter mineral marcado. Corpulento y bien estructurado, con vainilla, cacao y chocolate de la crianza. Final largo y complejo, potencial de guarda de 15 años.',
    maridaje: 'carnes rojas, carnes de caza, guisos, quesos duros, platos especiados', cuerpo: 5, frescura: 3, taninos: 4 },
  { nombre: 'El Peral Sauv. Blanc Uruco',
    tienda_url: 'https://www.aromadevid.com.ar/producto/el-peral-sauv-blanc-uruco/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Sauvignon Blanc de El Peral, Tupungato, de Uruco Wines.',
    maridaje: 'mariscos, pescados, ensaladas', cuerpo: 2, frescura: 5, taninos: 1 },
  { nombre: 'Finca Decero Mini Ed Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/finca-decero-mini-ed-cabernet-franc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/09/decero-mini-ediciones-cabernet-franc.png',
    nota: 'Cabernet Franc de edición limitada de Finca Decero, viñedo Remolinos — tres clones distintos, pimiento, grafito y ciruela. Acidez tensa que le da estructura, taninos definidos, gran potencial de guarda.',
    maridaje: 'carnes rojas de cocción lenta, quesos curados', cuerpo: 4, frescura: 4, taninos: 4 },
  { nombre: 'Flight Of The Condor Malbec',
    tienda_url: 'https://www.aromadevid.com.ar/producto/flight-of-the-condor-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/image-Photoroom-57.png',
    nota: 'Malbec de Agrelo — ciruela y mora maduras, un toque floral, especias suaves y un dejo ahumado delicado. Entrada suave, taninos redondos bien integrados, buen volumen y un final persistente y elegante.',
    maridaje: 'carnes rojas, cordero, asado, pastas con salsas intensas, quesos semiduros', cuerpo: 4, frescura: 3, taninos: 3 },
  { nombre: 'Foster Reserva Bonarda',
    tienda_url: 'https://www.aromadevid.com.ar/producto/enrique-foster-reserva-bonarda/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/09/EF-Reserva-Bonarda-scaled.jpg',
    nota: 'Bonarda de Los Árboles, Tunuyán — rojo violáceo intenso, ciruela como nota dominante. Elegante, con vainilla de la crianza en roble, buena estructura y un final largo y persistente.',
    maridaje: 'carnes y verduras a la parrilla, asado, quesos madurados', cuerpo: 4, frescura: 2, taninos: 3 },
  { nombre: 'Kaiken Ultra Malbec',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-ultra-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2019/02/imagen_2026-03-18_125207762.png',
    nota: 'Malbec de Valle de Uco — Los Chacayes, Altamira y Gualtallary combinados. Intenso, con especias, flores y fruta negra (arándanos, moras). Gran estructura con taninos suaves, final largo y complejo con un cierre herbal de romero y tomillo.',
    maridaje: 'guisos, carnes rojas simples, quesos de sabor intenso', cuerpo: 5, frescura: 3, taninos: 3 },
  { nombre: 'Kamala Skin Contact',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kamala-skin-contanct-naranjo/',
    imagen: '', // no se confirmó una foto real del producto en el listado
    nota: 'Naranjo de Dharma en Vista Flores, edición limitada de 3200 botellas — ámbar intenso con reflejos anaranjados, fruta blanca, cáscara de cítricos, flores secas, té y especias. Fermentado con las pieles: estructurado, con taninos propios del contacto y un final seco y persistente.',
    maridaje: 'quesos curados, picoteo, comida de fermentación (encurtidos, chucrut)', cuerpo: 3, frescura: 3, taninos: 3 },
  { nombre: 'Marchiori & Barraud Syrah Rosado',
    tienda_url: 'https://www.aromadevid.com.ar/producto/marchiori-barraud-syrah-rosado/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/09/marchiori-barraud-cuartel-2-syrah-rosado-x1-57709ce3856d5c60eb17574396945448-1024-1024.webp',
    nota: 'Rosado de Syrah de Finca La Esperanza, Tunuyán — prensado directo, sin maceración, fermentado como blanco. Rosa pálido, fresco y delicado, de cuerpo liviano y acidez crocante.',
    maridaje: 'aperitivo, mariscos, ensaladas, cocina de verano', cuerpo: 1, frescura: 5, taninos: 1 },
  { nombre: 'Quieto Syrah',
    tienda_url: 'https://www.aromadevid.com.ar/producto/quieto-syrah/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2019/11/Quieto-Syrah-scaled.png',
    nota: 'Syrah de Agrelo — violeta intenso, especias, eucalipto, pimiento rojo y cereza con un leve toque vegetal. Ataque suave, con mentol, hierbas y pasto sobre el fondo de cereza.',
    maridaje: 'verduras asadas, hortalizas, carnes rojas de contextura media, cerdo, pato', cuerpo: 3, frescura: 4, taninos: 2 },
  { nombre: 'Trivento Established Semillón',
    tienda_url: 'https://www.aromadevid.com.ar/producto/trivento-established-semillon/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Semillón de Mendoza, de la línea Established de Trivento.',
    maridaje: 'pescados, mariscos, quesos frescos', cuerpo: 3, frescura: 4, taninos: 1 },
  { nombre: 'Wapisa Pinot Noir',
    tienda_url: 'https://www.aromadevid.com.ar/producto/wapisa-pinot-noir/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/05/Wapisa_PN_SV_2018_web_1-scaled.png',
    nota: 'Pinot Noir de San Javier, Patagonia Atlántica, Río Negro — frutillas y frambuesas frescas, pétalos de rosa y cereza. Fresco y delicado, con taninos firmes de textura sedosa. Potencial de guarda de 8 años.',
    maridaje: 'langostinos en tempura, sushi, pescados, mariscos, pastas con salsas suaves', cuerpo: 3, frescura: 4, taninos: 3 },
];

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);

  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await dataRes.json();
  const rows = data.values || [];
  const headers = rows[0].map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  const colLetter = idx => String.fromCharCode(65 + idx);
  const iNombre = headers.indexOf('nombre');
  const cols = {
    nota: headers.indexOf('nota'),
    maridaje: headers.indexOf('maridaje'),
    imagen: headers.indexOf('imagen'),
    tienda_url: headers.indexOf('tienda_url'),
    perfil_cuerpo: headers.indexOf('perfil_cuerpo'),
    perfil_frescura: headers.indexOf('perfil_frescura'),
    perfil_taninos: headers.indexOf('perfil_taninos'),
  };
  for (const [k, idx] of Object.entries(cols)) if (idx < 0) throw new Error(`No se encontró la columna ${k} en el Sheet.`);

  const filas = rows.slice(1).map((r, i) => ({ filaSheet: i + 2, nombre: r[iNombre] || '' }));
  const cambios = [];
  const noEncontrados = [];

  for (const f of FICHAS) {
    const fila = filas.find(x => norm(x.nombre) === norm(f.nombre));
    if (!fila) { noEncontrados.push(f.nombre); continue; }
    cambios.push({ range: `Vinos!${colLetter(cols.nota)}${fila.filaSheet}`, values: [[f.nota]] });
    cambios.push({ range: `Vinos!${colLetter(cols.maridaje)}${fila.filaSheet}`, values: [[f.maridaje]] });
    cambios.push({ range: `Vinos!${colLetter(cols.tienda_url)}${fila.filaSheet}`, values: [[f.tienda_url]] });
    if (f.imagen) cambios.push({ range: `Vinos!${colLetter(cols.imagen)}${fila.filaSheet}`, values: [[f.imagen]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_cuerpo)}${fila.filaSheet}`, values: [[f.cuerpo]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_frescura)}${fila.filaSheet}`, values: [[f.frescura]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_taninos)}${fila.filaSheet}`, values: [[f.taninos]] });
    console.log(`✓ ${f.nombre} (fila ${fila.filaSheet})${f.imagen ? '' : ' — sin imagen real disponible'} — cuerpo:${f.cuerpo} frescura:${f.frescura} taninos:${f.taninos}`);
  }

  if (noEncontrados.length) console.log('\n⚠ No encontrados en el Sheet:', noEncontrados.join(', '));
  console.log(`\nTotal celdas a escribir: ${cambios.length}`);
  if (DRY_RUN) { console.log('(dry-run: no se escribió nada)'); return; }
  if (!cambios.length) return;

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: cambios }),
    }
  );
  if (!batchRes.ok) throw new Error(`Error escribiendo en el Sheet: ${await batchRes.text()}`);
  console.log('✓ Escrito.');
}

main().catch(e => { console.error(e); process.exit(1); });
