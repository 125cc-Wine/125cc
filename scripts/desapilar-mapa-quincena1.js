#!/usr/bin/env node
// scripts/desapilar-mapa-quincena1.js — Corrida puntual: al cargar
// perfil_cuerpo/frescura/taninos de los 14 vinos de la Quincena 1 (ver
// completar-fichas-quincena1.js) 3 pares quedaron con el MISMO perfil y por
// lo tanto en el MISMO punto del mapa (Desbandado/Coquena, Serbal/Tapiz,
// Quieto/Exupery) — dos vinos ocupando un solo pin, invisible para el
// cliente. Este script solo afina esos 3 perfiles con el detalle que ya
// estaba en su propia ficha técnica (no se inventa nada nuevo):
//
// - Desbandado (Malbec + Cabernet Franc, "taninos ya integrados", "toque
//   de frescura floral" por el Cab Franc) baja de taninos y sube de
//   frescura frente a Coquena (Cabernet Sauvignon puro de altura extrema,
//   "taninos firmes") — que se queda como estaba, más potente y central.
// - Tapiz ("sin maloláctica", dato técnico real que preserva acidez) se
//   queda como estaba; Serbal (sin esa mención) baja un punto de frescura
//   para no superponerse.
// - Exupery (12 meses en roble francés usado, "fácil de tomar") baja un
//   punto de taninos frente a Quieto (sin paso por roble, perfil más
//   herbal/verde) — que se queda como estaba.
//
// Uso: node scripts/desapilar-mapa-quincena1.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const AJUSTES = [
  { nombre: 'Desbandado Malbec Kaiken',      cuerpo: 4, frescura: 4, taninos: 3 }, // era 4/3/4
  { nombre: 'Serbal Malbec Rose Atamisque',  cuerpo: 2, frescura: 3, taninos: 1 }, // era 2/4/1
  { nombre: 'Exupery Cabernet Franc Reinero',cuerpo: 3, frescura: 4, taninos: 2 }, // era 3/4/3
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
    perfil_cuerpo: headers.indexOf('perfil_cuerpo'),
    perfil_frescura: headers.indexOf('perfil_frescura'),
    perfil_taninos: headers.indexOf('perfil_taninos'),
  };
  for (const [k, idx] of Object.entries(cols)) if (idx < 0) throw new Error(`No se encontró la columna ${k}.`);

  const filas = rows.slice(1).map((r, i) => ({ filaSheet: i + 2, nombre: r[iNombre] || '' }));
  const cambios = [];
  const noEncontrados = [];

  for (const a of AJUSTES) {
    const fila = filas.find(x => norm(x.nombre) === norm(a.nombre));
    if (!fila) { noEncontrados.push(a.nombre); continue; }
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_cuerpo)}${fila.filaSheet}`, values: [[a.cuerpo]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_frescura)}${fila.filaSheet}`, values: [[a.frescura]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_taninos)}${fila.filaSheet}`, values: [[a.taninos]] });
    console.log(`✓ ${a.nombre} (fila ${fila.filaSheet}) — cuerpo:${a.cuerpo} frescura:${a.frescura} taninos:${a.taninos}`);
  }

  if (noEncontrados.length) console.log('\n⚠ No encontrados:', noEncontrados.join(', '));
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
