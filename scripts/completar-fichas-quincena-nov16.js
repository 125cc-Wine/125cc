#!/usr/bin/env node
// scripts/completar-fichas-quincena-nov16.js — Corrida puntual: completa
// tienda_url/imagen/nota/maridaje/perfil_* de 13 de los 14 vinos de la
// Quincena 2 de noviembre 2026 (arranca 16/11). Fuente: ficha técnica real
// de cada producto en aromadevid.com.ar.
//
// ⚠️ "Kamala Rose Cabernet Franc" QUEDA AFUERA de este script — no está en
// el catálogo actual de aromadevid.com.ar (Dharma no tiene un rosado de
// Cabernet Franc listado, sólo el Skin Contact/Naranjo y otros varietales).
// Igual que con Amauta Cabernet Franc (Quincena 1 de noviembre), conviene
// confirmar disponibilidad más cerca de la fecha en vez de adivinar ahora.
//
// Fin del Mundo Reserva Merlot y Zolo Red Blend tienen ficha pobre en el
// sitio — nota más corta, perfil_* por criterio de varietal/estilo típico.
//
// perfil_* revisado a mano contra colisiones de mapa — hubo dos choques de
// 3 vinos y uno de 2, resueltos con detalle real de cada ficha.
//
// Uso: node scripts/completar-fichas-quincena-nov16.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: 'Chateaux Subsonico Naranjo',
    tienda_url: 'https://www.aromadevid.com.ar/producto/chateaux-subsonico-naranjo/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/09/CS-NARANJO.png',
    nota: 'Naranjo de Moscatel de Alejandría de Falasco — color cobrizo, floral e intenso, con piel de naranja, hierbas y frutas de carozo. Textura con taninos sutiles del contacto con la piel, equilibrada por una acidez refrescante.',
    maridaje: 'quesos, comida asiática, cocina de fusión', cuerpo: 3, frescura: 4, taninos: 2 },
  { nombre: 'Decero Syrah',
    tienda_url: 'https://www.aromadevid.com.ar/producto/finca-decero-signature-syrah/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/12/imagen_2025-12-02_101356773.png',
    nota: 'Syrah de Agrelo — púrpura profundo con matices violáceos, moras, ciruelas negras, violetas y pimienta negra. Boca amplia y jugosa, con taninos sedosos y un final largo con un toque de roble.',
    maridaje: 'cordero braseado, cerdo a fuego lento, pastas con hierbas, carnes a la parrilla, quesos semiduros madurados', cuerpo: 4, frescura: 2, taninos: 3 },
  { nombre: 'Fin Del Mundo Reserva Merlot',
    tienda_url: 'https://www.aromadevid.com.ar/producto/fin-del-mundo-reserva-merlot/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Merlot patagónico de Neuquén, de la línea Reserva de Bodega Fin del Mundo.',
    maridaje: 'carnes rojas, pastas con salsa', cuerpo: 3, frescura: 3, taninos: 2 },
  { nombre: 'Kaiken Mai',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-mai-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2018/08/MAI-scaled.jpg',
    nota: 'Malbec de alta gama de Kaiken, de Vistalba — rojo profundo con tonos violáceos, ciruela y cereza con tabaco y canela del roble francés. Elegante y complejo, con taninos suaves y una persistencia excelente. Potencial de guarda de más de 15 años.',
    maridaje: 'carnes rojas de guarda, caza mayor, quesos añejados', cuerpo: 5, frescura: 2, taninos: 3 },
  { nombre: 'Kaiken Nude',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-luxury-edition-20-years-copia/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2023/10/NUDE-Kaiken-scaled.jpg',
    nota: 'Rosado de Kaiken — 90% Garnacha, 10% Cabernet Sauvignon, de Valle de Canota a 1150 metros. Frambuesa, frutilla y granada frescas, con hierbas mediterráneas, azahar y un toque de pimienta rosa. Boca suave y amplia, casi cremosa, con acidez refrescante y final largo.',
    maridaje: 'cóctel de langostinos, pescados livianos, tapas, quesos de cabra, camembert, brie', cuerpo: 3, frescura: 3, taninos: 1 },
  { nombre: 'Los Escasos Cab. Sauv. Alta Vista',
    tienda_url: 'https://www.aromadevid.com.ar/producto/los-escasos-cabernet-sauvignon/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/09/Los-Escasos-Cabernet-Sauvignon-scaled.jpg',
    nota: 'Cabernet Sauvignon de edición muy limitada de Alta Vista (2508 botellas), de Campo de los Andes y El Cepillo — cereza, mora, tomillo y pimienta, con vainilla y notas ahumadas del roble. Concentrado, con taninos firmes y un final persistente. Potencial de guarda de más de 8 años.',
    maridaje: 'carnes rojas de guarda, quesos duros', cuerpo: 5, frescura: 3, taninos: 4 },
  { nombre: 'Monte Quieto Alegre Blend',
    tienda_url: 'https://www.aromadevid.com.ar/producto/montequieto-alegre-gran-corte/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/03/montequieto-alegre-blend-scaled.png',
    nota: 'Corte de Agrelo, Ugarteche y Vista Flores — 40% Cabernet Franc, 37% Malbec, 23% Syrah. Ciruelas, frutos secos y notas mentoladas. Equilibrado, con la acidez justa y un carácter herbal y especiado que le suma complejidad.',
    maridaje: 'alta cocina con especias y legumbres, carnes rojas, pato, cerdo, cocina de fusión aromática', cuerpo: 3, frescura: 3, taninos: 3 },
  { nombre: 'Pulenta Estate Pinot Noir',
    tienda_url: 'https://www.aromadevid.com.ar/producto/pulenta-estate-ix-pinot-noir/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/04/Pinot-scaled.png',
    nota: 'Pinot Noir de Valle de Uco, a 1200 metros — rubí pálido, cereza ácida, frutilla, flores blancas y rosas. Delicado y fresco, con una integridad estructural que sostiene un final largo, sedoso y persistente.',
    maridaje: 'mariscos, sushi, arroces, preparaciones livianas', cuerpo: 2, frescura: 4, taninos: 2 },
  { nombre: 'Qaramy Malbec',
    tienda_url: 'https://www.aromadevid.com.ar/producto/qaramy-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/09/QARAMY-MALBEC-scaled.jpg',
    nota: 'Malbec de Los Árboles, Valle de Uco — fermentado en vasijas de cemento con mínima intervención, la mitad del corte con 10 meses en roble francés. Equilibrado, fresco y elegante.',
    maridaje: 'carnes rojas, pastas con salsas de tomate', cuerpo: 4, frescura: 4, taninos: 2 },
  { nombre: 'Serbal Viognier',
    tienda_url: 'https://www.aromadevid.com.ar/producto/serbal-viognier/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/SViognier-488x1024-1.png',
    nota: 'Viognier de San José, Tupungato, a 1300 metros — amarillo dorado intenso, durazno blanco maduro y frutas de carozo, con intensidad y elegancia. Voluptuoso y frutado, con una acidez excelente que sostiene un final persistente.',
    maridaje: 'mariscos, pescados blancos con salsas, aves condimentadas, quesos de pasta blanda', cuerpo: 3, frescura: 5, taninos: 1 },
  { nombre: 'Tapiz Seleccion de Barricas',
    tienda_url: 'https://www.aromadevid.com.ar/producto/tapiz-seleccion-de-barricas/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/04/Tapiz___Seleccin_de_Barricas_2014_web-scaled.png',
    nota: 'Corte del viñedo único San Pablo, a 1350 metros — 34% Cabernet Sauvignon, 28% Malbec, 26% Merlot, 8% Cabernet Franc, 4% Syrah. Moras, frambuesas, ciruelas secas, cassis, café torrado, dulce de leche y chocolate negro. Frutos rojos bien integrados con el roble, taninos maduros y amables.',
    maridaje: 'carnes asadas, quesos madurados, alta gastronomía', cuerpo: 5, frescura: 3, taninos: 3 },
  { nombre: 'Trivento Golden Rva Chardonnay',
    tienda_url: 'https://www.aromadevid.com.ar/producto/trivento-golden-reserve-chardonnay/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/11/imagen_2025-11-18_113544020.png',
    nota: 'Chardonnay de Tupungato, Valle de Uco — amarillo dorado con reflejos verdosos, flores blancas, durazno, damasco y manzana verde, con coco, chocolate blanco y vainilla de la crianza. Estructura elegante con un centro fresco y vibrante, acidez mineral y textura untuosa.',
    maridaje: 'arroces, frutos de mar, sushi', cuerpo: 4, frescura: 5, taninos: 1 },
  { nombre: 'Zolo Red Blend',
    tienda_url: 'https://www.aromadevid.com.ar/producto/zolo-red-blend/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Corte de tintas de Bodega Zolo, Mendoza.',
    maridaje: 'carnes rojas, parrilla, quesos', cuerpo: 4, frescura: 3, taninos: 3 },
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
