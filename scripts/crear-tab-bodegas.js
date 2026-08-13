#!/usr/bin/env node
// scripts/crear-tab-bodegas.js — Corrida única: crea la pestaña "Bodegas" en el
// Sheet y la puebla migrando el texto que hoy vive repetido en Vinos!bodega_info.
// Donde una bodega aparecía en más de un vino, el texto se generalizó a mano
// (mismos datos — región, altura, suelo, estilo — sin inventar nada nuevo) para
// que sirva como descripción única de la bodega, no de un vino puntual.
//
// Uso: node scripts/crear-tab-bodegas.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

// nombre tal como aparece en Vinos!bodega → texto generalizado de la bodega
const BODEGAS = {
  'Reinero': 'Reinero elabora en distintas zonas del Valle de Uco, cruzando terruños a distintas alturas para sumar complejidad y frescura a sus vinos. Un proyecto que refleja la diversidad del paisaje vitivinícola mendocino.',
  'Dharma Wines': 'Dharma Wines elabora desde Vista Flores, una de las zonas más frescas del Valle de Uco, con foco en expresión varietal y elegancia por sobre la extracción. La altitud y los suelos arcilloso-pedregosos de la zona marcan la identidad de sus vinos.',
  'Ricominciare': 'Ricominciare nació como un proyecto de elaboración artesanal en La Consulta, San Carlos. Nombre italiano que significa empezar de nuevo — cada cosecha es un nuevo comienzo.',
  'Marchiori & Barraud': 'Marchiori & Barraud es una de las bodegas boutique más respetadas de Luján de Cuyo. Perdriel, su terruño principal, produce algunos de los Cabernet más complejos de Mendoza.',
  'Alta Vista': 'Alta Vista elabora en distintos terruños mendocinos, desde Campo los Andes —un paraje de clima frío extremo a más de 1.200 metros en Tunuyán— hasta parcelas de altitud media pensadas para vinos de consumo cotidiano. Busca siempre fineza y frescura por sobre la extracción.',
  'Gimenez Riili': 'Gimenez Riili trabaja en Los Chacayes y Vista Flores, dos zonas de gran altitud en Tunuyán, en el Valle de Uco. Sus proyectos nacen de la unión del equipo de bodega con las mejores parcelas de la zona.',
  'Kaiken': 'Kaiken elabora con uvas de Altamira y Vistalba, dos terruños complementarios que aportan fruta y estructura.',
  'Uruco Wines': 'Uruco Wines trabaja la finca El Peral en Tupungato, a 1.200 metros de altura, expresando lo mejor del terroir de altura.',
  'Collovatti': 'Collovatti es un enólogo de referencia que trabaja en La Rioja con Malbec de gran altura. Su proyecto demuestra que el Malbec argentino va mucho más allá de Mendoza.',
};

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  if (meta.sheets.some(s => s.properties.title === 'Bodegas')) {
    console.log('La pestaña "Bodegas" ya existe — no se toca. Borrala a mano si querés recrearla.');
    return;
  }

  const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Bodegas' } } }] }),
  });
  if (!addRes.ok) throw new Error(`Error creando pestaña: ${await addRes.text()}`);
  console.log('✓ Pestaña "Bodegas" creada.');

  const nombres = Object.keys(BODEGAS);
  const rows = [
    ['id', 'nombre', 'bodega_info'],
    ...nombres.map((nombre, i) => [i + 1, nombre, BODEGAS[nombre]]),
  ];

  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A1:C${rows.length}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: `Bodegas!A1:C${rows.length}`, values: rows }),
    }
  );
  if (!writeRes.ok) throw new Error(`Error escribiendo datos: ${await writeRes.text()}`);

  console.log(`✓ ${nombres.length} bodegas migradas: ${nombres.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
