#!/usr/bin/env node
// scripts/agregar-coordenadas-bodegas.js — Corrida única: agrega columnas D
// (lat) y E (lon) a la pestaña "Bodegas" del Sheet, para el mapa de
// ubicación de la ficha (ver renderBodegaMapa en public/index.html).
//
// Coordenadas geocodificadas a mano (WebSearch para la dirección + Nominatim/
// OpenStreetMap para lat/lon) el 2026-08-18. Para las boutique sin dirección
// pública indexada, se usa el centroide del distrito/localidad de la zona
// donde está la bodega (marcado exacta:false) — no es la puerta de la
// bodega, pero ubica bien la región en el mapa. Si en algún momento se
// consigue la dirección exacta, corré este script de nuevo con el dato
// actualizado (solo pisa D:E, no toca bodega_info).
//
// Uso: node scripts/agregar-coordenadas-bodegas.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const COORDS = {
  // exacta:true  → geocodificado desde la dirección real de la bodega (OSM).
  // exacta:false → centroide de la localidad/distrito de la zona (sin dirección pública indexada).
  'Reinero':              { lat: -33.5812925, lon: -69.0154258, exacta: false }, // Valle de Uco → centro de Tunuyán (proxy de la zona)
  'Dharma Wines':         { lat: -33.6509493, lon: -69.1555479, exacta: false }, // centroide Distrito Vista Flores, Tunuyán
  'Ricominciare':         { lat: -33.7362676, lon: -69.1181471, exacta: false }, // centroide Distrito La Consulta, San Carlos
  'Marchiori & Barraud':  { lat: -33.0778575, lon: -68.8854410, exacta: false }, // centroide Distrito Perdriel, Luján de Cuyo
  'Alta Vista':           { lat: -33.0025790, lon: -68.8742189, exacta: true  }, // Alzaga 3972, Chacras de Coria
  'Gimenez Riili':        { lat: -33.6038433, lon: -69.2203474, exacta: true  }, // Ruta 94 km 11, Los Chacayes, Tunuyán
  'Kaiken':                { lat: -33.0399624, lon: -68.9371918, exacta: true  }, // Roque Sáenz Peña 5516, Vistalba
  'Uruco Wines':          { lat: -33.3882649, lon: -69.1950556, exacta: false }, // El Peral, Tupungato (localidad)
  'Collovatti':           { lat: -29.1650010, lon: -67.4953596, exacta: false }, // Chilecito, La Rioja (ciudad más cercana a Valle de Famatina)
};

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A1:E500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Error leyendo Bodegas: ${await res.text()}`);
  const data = await res.json();
  const rows = data.values || [];
  if (!rows.length) throw new Error('La pestaña "Bodegas" está vacía o no existe — corré primero scripts/crear-tab-bodegas.js.');

  const header = rows[0];
  const dataRows = rows.slice(1);

  // Header: agrega lat/lon si todavía no están.
  if (header[3] !== 'lat' || header[4] !== 'lon') {
    const newHeader = [header[0] || 'id', header[1] || 'nombre', header[2] || 'bodega_info', 'lat', 'lon'];
    await writeRange(token, SHEET_ID, 'Bodegas!A1:E1', [newHeader]);
    console.log('✓ Encabezados D1:E1 = lat, lon');
  }

  let actualizadas = 0, sinMatch = [];
  for (let i = 0; i < dataRows.length; i++) {
    const nombre = (dataRows[i][1] || '').trim();
    const c = COORDS[nombre];
    if (!c) { sinMatch.push(nombre); continue; }
    const sheetRow = i + 2; // +1 header, +1 1-indexed
    await writeRange(token, SHEET_ID, `Bodegas!D${sheetRow}:E${sheetRow}`, [[c.lat, c.lon]]);
    console.log(`✓ ${nombre} → ${c.lat}, ${c.lon} (${c.exacta ? 'dirección exacta' : 'centroide de zona, aproximada'})`);
    actualizadas++;
  }

  console.log(`\n${actualizadas} bodega(s) geocodificada(s).`);
  if (sinMatch.length) console.log(`Sin coordenadas cargadas (no están en COORDS): ${sinMatch.join(', ')}`);
}

async function writeRange(token, sheetId, range, values) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, values }),
    }
  );
  if (!res.ok) throw new Error(`Error escribiendo ${range}: ${await res.text()}`);
}

main().catch(err => { console.error(err); process.exit(1); });
