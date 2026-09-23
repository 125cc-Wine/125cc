#!/usr/bin/env node
// scripts/corregir-fichas-auditoria-2026-09.js — Corrida puntual (23/09/2026):
// correcciones de datos que salieron de la auditoría de las 6 quincenas
// planificadas (01/10 a 16/12) y que no necesitan investigación externa —
// el error se ve en la propia fila (nombre/nota vs tipo/varietal/bodega).
//
// 1. tipo: 7 blancos/rosados/naranjos cargados como "Tinto". El tipo decide
//    el color del pin, los filtros del mapa y el sommelier (index.html).
// 2. varietal: los que contradicen al nombre o a la nota del propio vino
//    ("Tinto"/"Blanco" como varietal, "Tannat" en un Petit Verdot, "Blend"
//    en un Cabernet Franc puro).
// 3. bodega: "Ricomenciare"→"Ricominciare", "Dharma"→"Dharma Wines",
//    "Vinos"→"Decero". Las dos primeras no matcheaban la pestaña Bodegas,
//    así que esos vinos salían sin "Sobre la bodega" ni mapa. Se aplica a
//    TODAS las filas del Sheet con ese valor, y también al snapshot de
//    texto de carta_historial.bodega.
// 4. tienda_url que redirigen (301): se reemplazan por la URL final.
// 5. Nazareno Cabernet Sauvignon: fila duplicada (id 13 "Reinero Nazareno
//    Cabernet Sauvignon", misma tienda_url e imagen que id 61). La carta usa
//    id 61; se le copian suelo/crianza/temperatura desde id 13 (región y
//    altitud NO: la nota de id 61 ubica el vino en Chacayes y la de id 13
//    decía otra cosa — eso lo completa la investigación de región) y se
//    borra la fila de id 13. El producto del POS con vino_ref=13 se
//    reapunta a 61.
//
// Todo se busca por la columna id (no por número de fila) y las columnas
// por nombre de encabezado. Antes de escribir guarda backup de Vinos en
// scripts/backups/ (ignorado por git).
//
// Uso: node scripts/corregir-fichas-auditoria-2026-09.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), quiet: true });
const fs = require('fs');
const path = require('path');
const { getReadWriteToken } = require('../api/_lib/google-auth');
const { sql } = require('../api/_lib/db');

const DRY_RUN = process.argv.includes('--dry-run');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// id del Sheet → cambios. `_nombre` valida que el id apunte al vino
// esperado (aborta si no coincide).
const CAMBIOS = {
  16:  { _nombre: 'Serbal Malbec Rose Atamisque',        tipo: 'Rosado' },
  50:  { _nombre: 'Chateau Subsónico Pedro Giménez',     tipo: 'Blanco' },
  36:  { _nombre: 'Sur de los Andes Rose',               tipo: 'Rosado', varietal: 'Malbec · Syrah' },
  114: { _nombre: 'Trivento Established Semillón',       tipo: 'Blanco' },
  115: { _nombre: 'Kamala Skin Contact',                 tipo: 'Naranja' },
  123: { _nombre: 'Chateaux Subsonico Naranjo',          tipo: 'Naranja' },
  122: { _nombre: 'Trivento Golden Rva Chardonnay',      tipo: 'Blanco', varietal: 'Chardonnay' },
  71:  { _nombre: 'Padres Ded. P.  Verdot G. Riili',     varietal: 'Petit Verdot' },
  110: { _nombre: 'Amauta Cabernet Franc',               varietal: 'Cabernet Franc' },
  103: { _nombre: 'Flight Of The Condor Malbec',         varietal: 'Malbec' },
  107: { _nombre: 'Finca Decero Mini Ed Cabernet Franc', varietal: 'Cabernet Franc' },
  34:  { _nombre: 'Alta Vista Alizarine Malbec',         tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-single-vineyard-alizarine-2014/' },
  116: { _nombre: 'Kaiken Nude',                         tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-nude/' },
};
const RENOMBRAR_BODEGA = { 'ricomenciare': 'Ricominciare', 'dharma': 'Dharma Wines', 'vinos': 'Decero' };
const NAZARENO = { conservar: 61, borrar: 13, campos: ['suelo', 'crianza', 'temperatura'] };

function colLetter(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

async function main() {
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);
  const api = (p, opts = {}) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${p}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  const rows = (await (await api('/values/Vinos!A1:Z500')).json()).values || [];
  const h = rows[0].map(norm);
  const col = n => { const i = h.indexOf(n); if (i < 0) throw new Error(`Falta la columna ${n}`); return i; };
  const iId = col('id'), iNombre = col('nombre'), iBodega = col('bodega');
  const filaDeId = new Map(rows.slice(1).map((r, k) => [Number(r[iId]), k + 2]));

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `vinos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify(rows));
  console.log(`Backup: ${archivo}`);

  const updates = [];
  const set = (fila, campo, valor) => {
    const actual = rows[fila - 1][col(campo)] || '';
    if (actual === valor) return;
    updates.push({ range: `Vinos!${colLetter(col(campo))}${fila}`, values: [[valor]] });
    console.log(`  fila ${fila} ${rows[fila - 1][iNombre]} · ${campo}: "${actual}" → "${valor}"`);
  };

  for (const [id, c] of Object.entries(CAMBIOS)) {
    const fila = filaDeId.get(Number(id));
    if (!fila) throw new Error(`No existe id ${id}`);
    if (norm(rows[fila - 1][iNombre]) !== norm(c._nombre)) throw new Error(`id ${id} es "${rows[fila - 1][iNombre]}", esperaba "${c._nombre}"`);
    for (const [campo, valor] of Object.entries(c)) if (campo !== '_nombre') set(fila, campo, valor);
  }

  rows.slice(1).forEach((r, k) => {
    const nuevo = RENOMBRAR_BODEGA[norm(r[iBodega])];
    if (nuevo) set(k + 2, 'bodega', nuevo);
  });

  const fKeep = filaDeId.get(NAZARENO.conservar), fDel = filaDeId.get(NAZARENO.borrar);
  if (!fKeep || !fDel) throw new Error('No se encontraron las dos filas de Nazareno');
  if (!/nazareno cabernet sauvignon/.test(norm(rows[fDel - 1][iNombre]))) throw new Error(`id ${NAZARENO.borrar} no es Nazareno CS`);
  for (const campo of NAZARENO.campos) {
    const desde = rows[fDel - 1][col(campo)] || '';
    if (desde && !(rows[fKeep - 1][col(campo)] || '')) set(fKeep, campo, desde);
  }
  console.log(`  borrar fila ${fDel} (id ${NAZARENO.borrar}, "${rows[fDel - 1][iNombre]}")`);

  if (DRY_RUN) { console.log(`\n--dry-run: ${updates.length} celdas + 1 fila a borrar, no se escribió nada.`); return; }

  const up = await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: updates }) });
  if (!up.ok) throw new Error(await up.text());
  console.log(`\n✓ ${updates.length} celdas actualizadas.`);

  // Borrar la fila duplicada al final (corre las filas de abajo, por eso va
  // después de escribir las celdas).
  const meta = await (await api('?fields=sheets.properties')).json();
  const sheetId = meta.sheets.find(s => s.properties.title === 'Vinos').properties.sheetId;
  const del = await api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: fDel - 1, endIndex: fDel } } }] }) });
  if (!del.ok) throw new Error(await del.text());
  console.log(`✓ fila duplicada de Nazareno (id ${NAZARENO.borrar}) borrada.`);
  // El producto del POS que apuntaba a la fila borrada pasa a la que queda.
  const pos = await sql`UPDATE productos SET vino_ref = ${String(NAZARENO.conservar)} WHERE vino_ref = ${String(NAZARENO.borrar)}`;
  if (pos.rowCount) console.log(`✓ productos (POS): ${pos.rowCount} vino_ref ${NAZARENO.borrar} → ${NAZARENO.conservar}`);

  for (const [viejo, nuevo] of Object.entries(RENOMBRAR_BODEGA)) {
    const r = await sql`UPDATE carta_historial SET bodega = ${nuevo} WHERE lower(trim(bodega)) = ${viejo}`;
    if (r.rowCount) console.log(`✓ carta_historial: ${r.rowCount} filas bodega "${viejo}" → "${nuevo}"`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
