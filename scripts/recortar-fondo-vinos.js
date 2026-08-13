#!/usr/bin/env node
// scripts/recortar-fondo-vinos.js — Backfill: recorta el fondo blanco de las
// fotos de vino que ya están cargadas en el Sheet (columna `imagen`) y
// actualiza esa columna para que apunte a la versión con fondo recortado
// alojada en Vercel Blob. Reusa la misma lógica que api/extraer-imagen.js
// usa de acá en más para cada extracción nueva — esto es sólo para poner al
// día lo que ya estaba cargado antes de que existiera el recorte automático.
//
// Uso: node scripts/recortar-fondo-vinos.js [--dry-run]
// Necesita las mismas env vars que la app (.env.local): GOOGLE_SHEET_ID,
// GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, BLOB_READ_WRITE_TOKEN.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const crypto = require('crypto');
const { put } = require('@vercel/blob');
const { getReadWriteToken } = require('../api/_lib/google-auth');
const { recortarFondoBlanco } = require('../api/_lib/quitar-fondo');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('Faltan credenciales de Google en .env.local');
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Falta BLOB_READ_WRITE_TOKEN en .env.local');
    process.exit(1);
  }

  const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!dataRes.ok) throw new Error(`Error leyendo Vinos: ${await dataRes.text()}`);
  const data = await dataRes.json();
  const rows = data.values || [];
  if (!rows.length) throw new Error('Hoja Vinos vacía.');

  const headers = rows[0];
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  const colIdx = name => headers.findIndex(h => norm(h) === norm(name));
  const idxImagen = colIdx('imagen');
  const idxNombre = colIdx('nombre');
  const idxId      = colIdx('id');
  if (idxImagen < 0) throw new Error('No se encontró la columna "imagen" en el Sheet.');

  let procesados = 0, saltados = 0, fallidos = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const url = (row[idxImagen] || '').trim();
    const nombre = row[idxNombre] || `fila ${i + 1}`;
    if (!url) { continue; }
    if (url.includes('blob.vercel-storage.com')) {
      console.log(`= ${nombre}: ya tiene fondo recortado, salteo.`);
      saltados++;
      continue;
    }

    try {
      console.log(`… ${nombre}: descargando ${url}`);
      const imgRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 125ccBot/1.0; +https://www.125cc.com.ar)' },
      });
      if (!imgRes.ok) throw new Error(`descarga falló (${imgRes.status})`);
      const bytes = Buffer.from(await imgRes.arrayBuffer());

      const png = await recortarFondoBlanco(bytes);
      const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);

      if (DRY_RUN) {
        console.log(`  (dry-run) subiría vinos/${hash}.png (${png.length} bytes)`);
        procesados++;
        continue;
      }

      const blob = await put(`vinos/${hash}.png`, png, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'image/png',
      });

      const sheetRow = i + 1; // 1-indexed en Sheets
      const col = String.fromCharCode(65 + idxImagen);
      const range = `Vinos!${col}${sheetRow}`;
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ range, values: [[blob.url]] }),
        }
      );
      if (!updateRes.ok) throw new Error(`guardado en Sheet falló: ${await updateRes.text()}`);

      console.log(`✓ ${nombre}: ${blob.url}`);
      procesados++;
    } catch (err) {
      console.error(`✗ ${nombre}: ${err.message}`);
      fallidos++;
    }
  }

  console.log(`\nListo. Procesados: ${procesados}, salteados: ${saltados}, fallidos: ${fallidos}.`);
  if (DRY_RUN) console.log('(dry-run: no se subió nada a Blob ni se tocó el Sheet)');
}

main().catch(err => { console.error(err); process.exit(1); });
