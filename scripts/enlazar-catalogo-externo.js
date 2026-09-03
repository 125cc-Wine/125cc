#!/usr/bin/env node
// scripts/enlazar-catalogo-externo.js — Corrida puntual: la tabla
// `productos` del catálogo externo (Supabase, gestion-vinoteca2) NO
// guarda foto ni link de compra (confirmado con el usuario 03/09/2026) —
// cuando el Calendario de Carta crea un borrador para un vino de ese
// catálogo, imagen/tienda_url quedan vacíos. Este script busca cada vino
// a mano en aromadevid.com.ar (vía WebFetch, hecho antes de correr esto)
// y pega imagen + tienda_url en el Sheet por nombre normalizado.
//
// No hay forma de automatizar la BÚSQUEDA (necesita criterio para decidir
// si "Alta Vista Alizarine Malbec" es el mismo producto que "Alta Vista
// SINGLE VINEYARD ALIZARINE" del sitio) — este script solo automatiza la
// ESCRITURA una vez que ya se decidió el match. Wines sin imagen real
// disponible (solo el placeholder genérico de WooCommerce) se dejan con
// imagen vacía a propósito — un placeholder roto en el menú es peor que
// no tener foto (cae al ícono de copita, ya previsto en el diseño).
//
// Uso: node scripts/enlazar-catalogo-externo.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Quincena 1 de septiembre 2026 — verificado contra aromadevid.com.ar
// vino por vino el 03/09/2026.
const ENLACES = [
  { nombre: 'Desbandado Malbec Kaiken', tienda_url: 'https://www.aromadevid.com.ar/producto/desbandado-malbec-kaiken/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/10/thumb_70291_default_big.jpeg' },
  { nombre: 'Serbal Malbec Rose Atamisque', tienda_url: 'https://www.aromadevid.com.ar/producto/serbal-malbec-rose/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/SMalbecRose-488x1024-1.png' },
  { nombre: 'Sur de Los Andes Rva Pinot Noir', tienda_url: 'https://www.aromadevid.com.ar/producto/sur-de-los-andes-pinot-noir/', imagen: '' }, // solo placeholder en el sitio
  { nombre: 'Quieto Cabernet Franc', tienda_url: 'https://www.aromadevid.com.ar/producto/quieto-cabernet-franc/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/04/quieto-Franc-scaled.png' },
  { nombre: 'Kamala Sauvignon Blanc', tienda_url: 'https://www.aromadevid.com.ar/producto/kamala-sauvignon-blanc/', imagen: '' }, // solo placeholder en el sitio
  { nombre: 'Coquena Cabernet Sauvignon', tienda_url: 'https://www.aromadevid.com.ar/producto/coquena-cabernet-sauvignon/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/image-Photoroom-60.png' },
  { nombre: 'Marchiori & Barraud Chardonnay', tienda_url: 'https://www.aromadevid.com.ar/producto/marchiori-barraud-chardonnay/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/05/Marchiori-y-Barraud-Chardonnay-scaled.jpg' },
  { nombre: 'Trivento Stratus Blend', tienda_url: 'https://www.aromadevid.com.ar/producto/trivento-stratus-blend/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/09/1720673538_stratus.png' },
  { nombre: 'Alta Vista Alizarine Malbec', tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-single-vineyard-alizarine/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2018/07/Alta-Vista-Single-Vineyard-Alizarine.jpg' },
  { nombre: 'Tapiz Alta Collection Rose', tienda_url: 'https://www.aromadevid.com.ar/producto/tapiz-alta-collection-malbec-rose/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/08/Tapiz-Alta-Collection-Malbec-Rose-scaled.jpg' },
  { nombre: 'Padres Ded. P.  Verdot G. Riili', tienda_url: 'https://www.aromadevid.com.ar/producto/gimenez-riili-padres-dedicados-petit-verdot/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/09/gimenez-riili-padres-dedicados-petit-verdot-scaled.jpg' },
  { nombre: 'El Peral Merlot Uruco', tienda_url: 'https://www.aromadevid.com.ar/producto/el-peral-merlot-uruco/', imagen: '' }, // solo placeholder en el sitio
  { nombre: 'Exupery Cabernet Franc Reinero', tienda_url: 'https://www.aromadevid.com.ar/producto/exupery-cabernet-franc-reinero/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/07/Exupery-Malbec-scaled.jpg' },
  { nombre: 'Uno Malbec Antigal', tienda_url: 'https://www.aromadevid.com.ar/producto/antigal-uno-malbec/', imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/UNOMALBEC_2048x2048_crop_center@2x.png' },
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
  const colLetter = idx => String.fromCharCode(65 + idx); // 0->A, 1->B... (alcanza, son 22 columnas)
  const iNombre = headers.indexOf('nombre');
  const iImagen = headers.indexOf('imagen');
  const iTienda = headers.indexOf('tienda_url');
  if (iNombre < 0 || iImagen < 0 || iTienda < 0) throw new Error('No se encontraron las columnas nombre/imagen/tienda_url en el Sheet.');

  const filas = rows.slice(1).map((r, i) => ({ filaSheet: i + 2, nombre: r[iNombre] || '' }));
  const cambios = [];
  const noEncontrados = [];

  for (const enlace of ENLACES) {
    const fila = filas.find(f => norm(f.nombre) === norm(enlace.nombre));
    if (!fila) { noEncontrados.push(enlace.nombre); continue; }
    if (enlace.tienda_url) cambios.push({ range: `Vinos!${colLetter(iTienda)}${fila.filaSheet}`, values: [[enlace.tienda_url]] });
    if (enlace.imagen) cambios.push({ range: `Vinos!${colLetter(iImagen)}${fila.filaSheet}`, values: [[enlace.imagen]] });
    console.log(`✓ ${enlace.nombre} (fila ${fila.filaSheet})${enlace.imagen ? '' : ' — sin imagen real disponible, solo link'}`);
  }

  if (noEncontrados.length) console.log('\n⚠ No encontrados en el Sheet (revisar nombre):', noEncontrados.join(', '));
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
