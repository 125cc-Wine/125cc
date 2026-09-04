#!/usr/bin/env node
// scripts/completar-fichas-quincena2-sept.js — Corrida puntual: completa
// tienda_url/imagen/nota/maridaje/perfil_* de los 13 vinos de la Quincena 2
// de septiembre 2026 (arranca 16/09) que todavía no tenían ficha (uno de
// los 14, Reinero Reserva Blend, ya estaba completo desde antes).
//
// Mismo criterio que completar-fichas-quincena1.js: fuente es la ficha
// técnica real de cada producto en aromadevid.com.ar, reescrita en la voz
// de 125cc — no inventada. Dos vinos (Latente Malbec Cuarto Surco, Uruco
// Merlot) tienen fichas casi vacías en el sitio del distribuidor: la nota
// queda corta a propósito en vez de inventar notas de cata que nadie
// verificó, y su perfil_* es el default razonable del varietal, no una
// estimación de la ficha (no hay ficha). Tres vinos (Latente Malbec, Uruco
// Merlot, y la imagen del propio Latente) sólo tienen la imagen genérica
// de WooCommerce en el sitio — se dejan sin imagen a propósito, mismo
// criterio que ya usa enlazar-catalogo-externo.js.
//
// perfil_cuerpo/frescura/taninos ya se revisaron a mano contra colisiones
// de mapa (dos vinos con el mismo perfil caen en el mismo pin) — no quedó
// ninguna entre estos 13 + Reinero Reserva Blend.
//
// IMPORTANTE: correr scripts/recortar-fondo-vinos.js después de este
// script — las imágenes de acá son fotos de estudio de la tienda, sin
// recortar (ver el aviso de fondo blanco en enlazar-catalogo-externo.js).
//
// Uso: node scripts/completar-fichas-quincena2-sept.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: 'Alta Vista Estate Premium Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-estate-premium-cabernet-franc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2019/04/Alta-Vista-Estate-Cabernet-Franc-scaled.jpg',
    nota: 'Cabernet Franc de Valle de Uco con estructura sólida — hierbas, frutos rojos y un toque de pimienta. Taninos firmes que dan una persistencia larga, con potencial de guarda de hasta 7 años.',
    maridaje: 'carnes asadas, carnes condimentadas, quesos, embutidos', cuerpo: 4, frescura: 3, taninos: 4 },
  { nombre: 'Catalpa Malbec Atamisque',
    tienda_url: 'https://www.aromadevid.com.ar/producto/catalpa-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/CatalpaMalbec-488x1024-1.png',
    nota: 'Malbec de La Consulta, a 1150 metros — violetas, frutos negros y un toque sutil de café y tabaco. Boca concentrada y untuosa, con taninos bien integrados por el paso en roble francés.',
    maridaje: 'carnes a la parrilla, quesos, dulce de membrillo', cuerpo: 5, frescura: 2, taninos: 4 },
  { nombre: 'Chateau Subsónico Pedro Giménez',
    tienda_url: 'https://www.aromadevid.com.ar/producto/chateau-subsonico-pedro-gimenez/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/09/CS-PEDRO-GIMENEZ.png',
    nota: 'Pedro Giménez de la línea experimental de Falasco — cítrico y floral, liviano y fresco, con etiqueta de arte contemporáneo tan directa como el vino.',
    maridaje: 'aperitivo, comidas livianas, mariscos, ensaladas', cuerpo: 2, frescura: 4, taninos: 1 },
  { nombre: 'Hermandad Blend Falasco',
    tienda_url: 'https://www.aromadevid.com.ar/producto/hermandad-blend/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/10/Hermandad-Blend-scaled.jpg',
    nota: 'Corte de cuatro varietales de Falasco — Malbec, Cabernet Sauvignon, Merlot y Petit Verdot, Valle de Uco. Fruta negra madura, especias dulces y vainilla, con taninos estructurados pero aterciopelados y un final largo.',
    maridaje: 'quesos duros, guisos, carnes rojas, pastas rellenas con salsas contundentes', cuerpo: 4, frescura: 3, taninos: 2 },
  { nombre: 'Kaiken Ultra Pinot Noir',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-ultra-pinot-noir/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/08/Ultra-Pinot-scaled.png',
    nota: 'Pinot Noir patagónico de Kaiken, el primero de la bodega con uvas de Neuquén. Muy frutado y fresco, con taninos delicados y un final elegante y prolongado.',
    maridaje: 'pescados grasos, sushi, sopas, quesos', cuerpo: 2, frescura: 4, taninos: 2 },
  { nombre: 'Kamala Criolla Dharma',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kamala-criolla/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/01/kamala-criolla-f87e3098bdfdb6b5c417399186034968-1024-1024.webp',
    nota: 'Criolla de Dharma en Vista Flores, sin paso por roble — rojo rubí claro, frutilla y cereza frescas con un toque floral. Entrada ágil y acidez marcada; se sirve fresco, casi como un tinto de verano.',
    maridaje: 'picadas, comidas livianas, quesos frescos', cuerpo: 1, frescura: 5, taninos: 1 },
  { nombre: 'Latente Malbec Cuarto Surco',
    tienda_url: 'https://www.aromadevid.com.ar/producto/latente-malbec-cuarto-surco/',
    imagen: '', // sitio sólo tiene el placeholder genérico de WooCommerce
    nota: 'Malbec de la línea Latente de Bodega Cuarto Surco, Mendoza.',
    maridaje: 'carnes rojas, parrilla', cuerpo: 4, frescura: 3, taninos: 3 },
  { nombre: 'Lorca Opalo Syrah',
    tienda_url: 'https://www.aromadevid.com.ar/producto/2846/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/04/ML-Opalo-Syrah2-scaled.png',
    nota: 'Syrah de Vista Flores — pimienta, menta y flores sobre un rojo violáceo profundo. Muy buena estructura, con un final suave, elegante y persistente.',
    maridaje: 'carnes blancas condimentadas, carnes rojas, arroces, guisos, pastas', cuerpo: 4, frescura: 2, taninos: 4 },
  { nombre: 'Nazareno Cabernet Sauvignon Reinero',
    tienda_url: 'https://www.aromadevid.com.ar/producto/nazareno-cabernet-sauvignon-reinero/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/07/NAZARENO-CABERNET-SAUVIGNON-scaled.jpg',
    nota: 'Cabernet Sauvignon de Chacayes, a 1100 metros — frutado e intenso, de buen cuerpo y fácil de tomar, con un fondo herbáceo. Taninos equilibrados gracias a 16 días de encubado y crianza mixta en roble francés y americano.',
    maridaje: 'carnes rojas, guisos, quesos duros', cuerpo: 4, frescura: 2, taninos: 3 },
  { nombre: 'Sur de los Andes Rose',
    tienda_url: 'https://www.aromadevid.com.ar/producto/sur-de-los-andes-rose/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/sur_de_los_andes_chardonnay-07d514ec88317ccbe917528742017203-1024-1024.webp',
    nota: 'Rosado de Malbec y Syrah de Pablo Durigutti — salmón pálido con reflejos acerados, ananá maduro y un toque herbáceo. Entrada sedosa, acidez marcada y un dulzor apenas insinuado.',
    maridaje: 'ensaladas, mariscos, sushi, pastas frías, quesos frescos, aperitivos', cuerpo: 3, frescura: 5, taninos: 1 },
  { nombre: 'Uno Pinot Gris Antigal',
    tienda_url: 'https://www.aromadevid.com.ar/producto/antigal-uno-pinot-grigio/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/large-Mesadetrabajo1copia5.png',
    nota: 'Pinot Grigio de Antigal, de Gualtallary y La Arboleda — pera, flores blancas y cítricos, fresco y vivaz. Liviano, con un final delicado pensado para la mesa.',
    maridaje: 'sushi, cocina nikkei, burrata, ensaladas frescas, pastas con vegetales, pescados blancos a la parrilla', cuerpo: 2, frescura: 5, taninos: 1 },
  { nombre: 'Uruco Merlot',
    tienda_url: 'https://www.aromadevid.com.ar/producto/uruco-merlot/',
    imagen: '', // sitio sólo tiene el placeholder genérico de WooCommerce
    nota: 'Merlot de Uruco Wines, Mendoza — perfil típico del varietal: ciruela madura y taninos suaves.',
    maridaje: 'carnes rojas, pastas con salsa', cuerpo: 3, frescura: 3, taninos: 2 },
  { nombre: 'Zolo Black Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/zolo-black-cabernet-franc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/05/Zolo_Black___Cabernet_Franc_3_1-scaled.png',
    nota: 'Cabernet Franc de Agrelo — frambuesa, grosella negra, violetas y un toque de pimiento verde y grafito. Boca suave, con taninos delicados y un final largo. 18 meses en roble, potencial de guarda de 10 años.',
    maridaje: 'cordero condimentado, carnes rojas, carnes de caza, quesos duros, charcutería, cerdo', cuerpo: 3, frescura: 4, taninos: 2 },
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
