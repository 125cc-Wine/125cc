#!/usr/bin/env node
// scripts/aplicar-investigacion-fichas-2026-09.js — Corrida puntual
// (23/09/2026): vuelca al Sheet lo que se investigó para completar las
// fichas de la carta 01/10–16/12 (fotos faltantes, notas pobres, cepas
// dudosas, región y datos técnicos, y la pestaña Bodegas).
//
// Entrada: un directorio con
//   research-*.json  → [{ id, nombre, cambios: { campo: valor } , fuentes }]
//   bodegas.json     → [{ nombre, bodega_info, lat, lon }]
// Cada dato sale de una fuente citada (ficha técnica de Aroma de Vid, sitio
// de la bodega u otro retailer) — lo que no tenía fuente quedó afuera, no
// se completó a ojo.
//
// Vinos: se ubican por id (columna A), nunca por número de fila, y las
// columnas por nombre de encabezado. Solo se aceptan campos de la lista
// CAMPOS. Si cambia `nombre`, también se renombra en carta_historial (el
// match carta ↔ Sheet es por nombre normalizado).
// Bodegas: si la bodega ya existe se completan sólo las celdas vacías; si no
// existe se agrega una fila con el id siguiente.
//
// Después de correr esto: node scripts/recortar-fondo-vinos.js (las fotos
// nuevas son URLs externas sin recortar).
//
// Uso: node scripts/aplicar-investigacion-fichas-2026-09.js <dir> [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), quiet: true });
const fs = require('fs');
const path = require('path');
const { getReadWriteToken } = require('../api/_lib/google-auth');
const { sql } = require('../api/_lib/db');

const DRY_RUN = process.argv.includes('--dry-run');
const DIR = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!DIR) { console.error('Uso: node scripts/aplicar-investigacion-fichas-2026-09.js <dir> [--dry-run]'); process.exit(1); }
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const CAMPOS = ['nombre', 'tipo', 'varietal', 'region', 'altitud', 'suelo', 'crianza', 'temperatura', 'nota', 'maridaje', 'tienda_url', 'imagen', 'perfil_cuerpo', 'perfil_frescura', 'perfil_taninos'];

function colLetter(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

async function main() {
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);
  const api = (p, opts = {}) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${p}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const leer = async r => (await (await api(`/values/${r}`)).json()).values || [];

  const vinos = await leer('Vinos!A1:Z500');
  const bodegas = await leer('Bodegas!A1:E500');
  const dirBk = path.join(__dirname, 'backups');
  fs.mkdirSync(dirBk, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dirBk, `vinos-${stamp}.json`), JSON.stringify(vinos));
  fs.writeFileSync(path.join(dirBk, `bodegas-${stamp}.json`), JSON.stringify(bodegas));

  const h = vinos[0].map(norm);
  const col = n => { const i = h.indexOf(n); if (i < 0) throw new Error(`Falta la columna ${n}`); return i; };
  const filaDeId = new Map(vinos.slice(1).map((r, k) => [Number(r[col('id')]), k + 2]));

  const updates = [];
  const renombres = [];
  const archivos = fs.readdirSync(DIR).filter(f => /^research-.*\.json$/.test(f));
  for (const f of archivos) {
    for (const item of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      const fila = filaDeId.get(Number(item.id));
      if (!fila) { console.log(`⚠ ${f}: id ${item.id} (${item.nombre}) no existe, salteo`); continue; }
      const actualNombre = vinos[fila - 1][col('nombre')];
      if (norm(actualNombre) !== norm(item.nombre)) { console.log(`⚠ ${f}: id ${item.id} es "${actualNombre}", no "${item.nombre}" — salteo`); continue; }
      for (const [campo, valor] of Object.entries(item.cambios || {})) {
        if (!CAMPOS.includes(campo)) { console.log(`⚠ campo no permitido ${campo}`); continue; }
        if (valor == null || valor === '') continue;
        const v = String(valor);
        const actual = vinos[fila - 1][col(campo)] || '';
        if (actual === v) continue;
        updates.push({ range: `Vinos!${colLetter(col(campo))}${fila}`, values: [[v]] });
        console.log(`  ${actualNombre} · ${campo}: "${actual.slice(0, 50)}" → "${v.slice(0, 70)}"`);
        if (campo === 'nombre') renombres.push([actualNombre, v]);
      }
    }
  }

  // Pestaña Bodegas: completar existentes / agregar nuevas.
  const bodegaUpdates = [];
  const nuevas = [];
  const pathBod = path.join(DIR, 'bodegas.json');
  if (fs.existsSync(pathBod)) {
    const filaBod = new Map(bodegas.slice(1).map((r, k) => [norm(r[1]), k + 2]));
    let proxId = Math.max(0, ...bodegas.slice(1).map(r => parseInt(r[0]) || 0)) + 1;
    for (const b of JSON.parse(fs.readFileSync(pathBod, 'utf8'))) {
      const valores = [b.bodega_info || '', b.lat ?? '', b.lon ?? ''];
      const fila = filaBod.get(norm(b.nombre));
      if (fila) {
        ['C', 'D', 'E'].forEach((letra, k) => {
          if (!(bodegas[fila - 1][k + 2] || '') && valores[k] !== '') {
            bodegaUpdates.push({ range: `Bodegas!${letra}${fila}`, values: [[valores[k]]] });
            console.log(`  Bodega ${b.nombre} · ${['bodega_info', 'lat', 'lon'][k]} completado`);
          }
        });
      } else {
        nuevas.push([proxId++, b.nombre, ...valores]);
        console.log(`  Bodega nueva: ${b.nombre}${b.lat == null ? ' (sin coordenadas)' : ''}`);
      }
    }
  }

  console.log(`\nVinos: ${updates.length} celdas · Bodegas: ${bodegaUpdates.length} celdas + ${nuevas.length} filas nuevas · renombres: ${renombres.length}`);
  if (DRY_RUN) { console.log('--dry-run: no se escribió nada.'); return; }

  const data = [...updates, ...bodegaUpdates];
  if (data.length) {
    const r = await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
    if (!r.ok) throw new Error(await r.text());
  }
  if (nuevas.length) {
    const r = await api(`/values/${encodeURIComponent('Bodegas!A1:E1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: nuevas }) });
    if (!r.ok) throw new Error(await r.text());
  }
  for (const [viejo, nuevo] of renombres) {
    const r = await sql`UPDATE carta_historial SET vino_nombre = ${nuevo} WHERE vino_nombre = ${viejo}`;
    console.log(`✓ carta_historial: "${viejo}" → "${nuevo}" (${r.rowCount} filas)`);
  }
  console.log('✓ Listo. Ahora: node scripts/recortar-fondo-vinos.js');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
