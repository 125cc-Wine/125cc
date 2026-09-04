#!/usr/bin/env node
// scripts/completar-amauta-kamala-rosado.js — Corrida puntual: cierra los
// 2 huecos que quedaron pendientes en las quincenas de noviembre.
//
// - "Kamala Rose Cabernet Franc" (Quincena 2, 16/11) SÍ existía en
//   aromadevid.com.ar, pero como "Kamala Cabernet Franc Rosado" (orden de
//   palabras distinto) — por eso la búsqueda original no lo encontró. El
//   dueño de paso arregló que la fila de La Vid no tenía el link seteado
//   y sincronizó el stock (Woo mostraba 12, el sistema interno 45).
// - "Amauta Cabernet Franc" (Quincena 1, 01/11) era un hueco real: nunca
//   se había creado en WooCommerce. El dueño lo creó ahora ($16.500,
//   publicado, sin stock — Supabase lo tiene en 0) y corrigió el varietal
//   en Supabase (decía "Blend", el producto es Cabernet Franc puro). Ficha
//   nueva, sin nota de cata propia todavía en el sitio — perfil_* por
//   criterio de varietal/región (Cafayate, altura extrema → más frescura).
//
// perfil_* revisado contra colisiones dentro de cada quincena — ninguna.
//
// Uso: node scripts/completar-amauta-kamala-rosado.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: 'Amauta Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/amauta-cabernet-franc/',
    imagen: '', // ficha recién creada, todavía sin foto real en el sitio
    nota: 'Cabernet Franc de Cafayate, Salta, de la línea Amauta de El Porvenir — altura extrema del norte argentino.',
    maridaje: 'carnes rojas, empanadas salteñas, quesos de cabra', cuerpo: 3, frescura: 5, taninos: 3 },
  { nombre: 'Kamala Rose Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kamala-cabernet-franc-rosado/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/kamala-cabernet-franc-rose-e82595716ff3f1f55617399192125798-1024-1024.webp',
    nota: 'Rosado de Cabernet Franc orgánico de Dharma, Vista Flores — salmón brillante con reflejos acerados, frutilla y frambuesa con violetas y un fondo herbáceo. Vibrante y refrescante, con acidez marcada y buena estructura para un rosado, final limpio y prolongado.',
    maridaje: 'ensaladas, sushi, mariscos, tarta de verduras, quesos frescos', cuerpo: 2, frescura: 5, taninos: 1 },
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
