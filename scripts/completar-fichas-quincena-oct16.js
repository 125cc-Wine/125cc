#!/usr/bin/env node
// scripts/completar-fichas-quincena-oct16.js — Corrida puntual: completa
// tienda_url/imagen/nota/maridaje/perfil_* de los 14 vinos de la Quincena 2
// de octubre 2026 (arranca 16/10). Fuente: ficha técnica real de cada
// producto en aromadevid.com.ar. Alta Vista Terroir Malbec Salta y El
// Porvenir GSM Peq. Fermentación tienen ficha pobre en el sitio — nota
// más corta, perfil_* con criterio (varietal/región/estilo típico) en vez
// de datos de cata puntuales.
//
// perfil_* revisado a mano contra colisiones de mapa — hubo un choque de
// 4 vinos en el mismo punto (0,25) y dos choques de a 2, resueltos con
// detalle real de cada ficha (ver commit).
//
// Todas las imágenes son fotos de estudio sin recortar — correr
// scripts/recortar-fondo-vinos.js después de este script.
//
// Uso: node scripts/completar-fichas-quincena-oct16.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: '2456 Sauvignon Blanc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/2456-sauvignon-blanc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/image-Photoroom-83.png',
    nota: 'Sauvignon Blanc de Medrano, Maipú, producción limitada — pomelo, lima y fruta blanca con un toque herbáceo. Entrada vibrante, acidez marcada y refrescante, final limpio.',
    maridaje: 'aperitivo, pescados, mariscos', cuerpo: 2, frescura: 5, taninos: 1 },
  { nombre: 'Alta Vista Estate Premium Torrontes',
    tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-premium-estate-torrontes/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/10/Alta-Vista-Estate-Torrontes-scaled.jpg',
    nota: 'Torrontés de Cafayate, viñedos a más de 1000 metros — floral y a fruta blanca, con una boca amplia y redonda que exalta la frescura y vivacidad propia del varietal.',
    maridaje: 'aperitivo, frutos de mar, empanadas salteñas', cuerpo: 3, frescura: 5, taninos: 1 },
  { nombre: 'Alta Vista Terroir Malbec Salta',
    tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-terroir-malbec-salta/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Malbec de Salta de la línea Terroir Selection de Alta Vista.',
    maridaje: 'carnes rojas, parrilla', cuerpo: 4, frescura: 3, taninos: 3 },
  { nombre: 'Catalpa Merlot Atamisque',
    tienda_url: 'https://www.aromadevid.com.ar/producto/catalpa-merlot/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/CatalpaMerlot-488x1024-1.png',
    nota: 'Merlot de Tupungato — fruta roja fresca con especias, y un fondo de vainilla y caramelo de la crianza. Textura sedosa, taninos gentiles y un final elegante y prolongado.',
    maridaje: 'pastas, aves, cerdo, quesos de intensidad media', cuerpo: 3, frescura: 4, taninos: 2 },
  { nombre: 'Decero The Owl & The Dust Devil Cabernet Sauvignon',
    tienda_url: 'https://www.aromadevid.com.ar/producto/the-owl-the-dust-devil-cabernet-sauvignon/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/11/The-Owl-and-The-Dust-Devil-Cabernet-Sauvignon-Bottle-Shot-Photoroom-1.png',
    nota: 'Cabernet Sauvignon de Agrelo, viñedo Remolinos a 1050 metros — cassis, ciruela, grafito, cedro y especias. Taninos sedosos pero firmes, con una acidez que le da tensión y un final largo y elegante.',
    maridaje: 'carnes a la parrilla, quesos madurados', cuerpo: 4, frescura: 4, taninos: 4 },
  { nombre: 'El Peral Rose Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/finca-el-peral-rose-uruco-wines/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/11/imagen_2025-11-17_183402687-Photoroom.png',
    nota: 'Rosado de Malbec de El Peral, Tupungato — salmón brillante con reflejos cobrizos, flores blancas, frutillas y cerezas frescas. Entrada envolvente, acidez equilibrada y final persistente.',
    maridaje: 'ensaladas, ceviches, tartares, sushi, quesos blandos, picoteo', cuerpo: 2, frescura: 3, taninos: 1 },
  { nombre: 'El Porvenir Gsm Peq Fermentacion',
    tienda_url: 'https://www.aromadevid.com.ar/producto/el-porvenir-gsm-peq-fermentacion/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Corte de Garnacha, Syrah y Mourvèdre de Cafayate, Salta — de la línea Pequeñas Fermentaciones de El Porvenir de los Andes.',
    maridaje: 'carnes rojas, guisos, quesos de oveja', cuerpo: 4, frescura: 4, taninos: 3 },
  { nombre: 'Finca Flichman Estate Rose',
    tienda_url: 'https://www.aromadevid.com.ar/producto/finca-flichman-rose/',
    imagen: '', // no se confirmó una foto real del producto en el listado
    nota: 'Rosado de Barrancas, Maipú — mitad Malbec, mitad Torrontés. Fresco y moderno, pensado para tomar liviano.',
    maridaje: 'mariscos, carnes blancas', cuerpo: 2, frescura: 4, taninos: 1 },
  { nombre: 'Kaiken Ultra Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-ultra-cabernet-franc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/10/KAIKEN-ULTRA-Cabernet-Franc-2022-scaled.jpg',
    nota: 'Cabernet Franc de Vistalba, Luján de Cuyo — grosella negra y cereza sobre un rojo rubí profundo. Cuerpo completo, taninos maduros y abundantes, elegante y de final largo.',
    maridaje: 'carnes de caza, platos complejos, quesos maduros', cuerpo: 4, frescura: 3, taninos: 4 },
  { nombre: 'Kamala Pinot Noir Dharma',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kamala-pinot-noir/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/image-Photoroom-66.png',
    nota: 'Pinot Noir de Vista Flores, Valle de Uco — cereza y frambuesa frescas, con notas florales, especias suaves y un fondo terroso. Entrada delicada, taninos finos y sedosos, acidez equilibrada.',
    maridaje: 'pato, cerdo, salmón, quesos blandos', cuerpo: 2, frescura: 4, taninos: 2 },
  { nombre: 'Lorca Gran Opalo Red Blend',
    tienda_url: 'https://www.aromadevid.com.ar/producto/2952/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/05/ML-Gran-Opalo-Red-Blend-scaled.png',
    nota: 'Corte de Vista Flores — 30% Malbec, 30% Cabernet Sauvignon, 30% Syrah, 10% Petit Verdot. Aromático y expresivo, con frutos rojos, especias y cuero. Taninos suaves y dulces, final elegante y persistente.',
    maridaje: 'carnes rojas asadas bien condimentadas, vegetales grillados, pastas de intensidad media', cuerpo: 4, frescura: 3, taninos: 2 },
  { nombre: 'Pasion 4 Malbec Joffré',
    tienda_url: 'https://www.aromadevid.com.ar/producto/joffre-pasion-4-malbec/',
    imagen: '', // sitio sin foto real confirmada
    nota: 'Malbec de Joffré — rojo rubí intenso, con cereza y frutilla, y un dejo sutil de tabaco y vainilla.',
    maridaje: 'carnes rojas, parrilla, pastas', cuerpo: 3, frescura: 3, taninos: 2 },
  { nombre: 'Ricominciare Codice Blend',
    tienda_url: 'https://www.aromadevid.com.ar/producto/ricominciare-altisimo-codice/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/07/Ricominciare-Codice-scaled.jpg',
    nota: 'Corte de La Consulta — Malbec, Cabernet Franc, Merlot y Cabernet Sauvignon, 12 meses en roble. Frutado y especiado, complejo, equilibrado, intenso y persistente. Gran cuerpo.',
    maridaje: 'carnes a la parrilla, cordero, cabrito, pastas con crema y salsa especiada', cuerpo: 5, frescura: 3, taninos: 4 },
  { nombre: 'Tapiz Reserva Cabernet Merlot',
    tienda_url: 'https://www.aromadevid.com.ar/producto/tapiz-reserve-cabernet-merlot/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/tapiz-reserva-cab-merl-2017-10241-59a34569a47bf0f7d716155060280083-640-0.webp',
    nota: 'Corte de Cabernet Sauvignon y Merlot de Luján de Cuyo — rojo intenso con reflejos granate, fruta madura, especias dulces, cedro y vainilla. Equilibrado y sedoso, con taninos redondos.',
    maridaje: 'carnes rojas, pastas con salsas intensas, estofados, quesos semiduros', cuerpo: 4, frescura: 2, taninos: 3 },
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
