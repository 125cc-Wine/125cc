#!/usr/bin/env node
// scripts/completar-fichas-quincena1.js — Corrida puntual: completa
// nota/maridaje/perfil_cuerpo/perfil_frescura/perfil_taninos de los 14
// vinos de la Quincena 1 de septiembre 2026, que quedaron con esos
// campos vacíos desde que se confirmó la carta (13/08) sin que nadie
// llegara a completarlos antes del 1/09 (ver handoff de esa sesión).
//
// Fuente: ficha técnica real de cada producto en aromadevid.com.ar
// (varietal, región, notas de cata, maridaje del propio distribuidor),
// reescrita en la voz de 125cc (concisa, en español, sin copiar texto de
// marketing de otro sitio tal cual) — no inventada. perfil_* (escala 1-5)
// es una estimación razonada a partir de esa misma ficha técnica (tipo de
// uva, crianza, descriptores de boca), no una medición de laboratorio.
//
// Con esto, api/obtener-vinos.js ya puede derivar x/y del mapa cartesiano
// de estos 3 campos en vez de dejarlos en el default (3/3/3 → todos
// apilados en el centro, 0,0).
//
// Uso: node scripts/completar-fichas-quincena1.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: 'Desbandado Malbec Kaiken',
    nota: 'Malbec de Altamira con un toque de Cabernet Franc que le suma frescura floral. Fruta negra y roja madura, un dejo especiado y un final largo, con taninos ya integrados.',
    maridaje: 'carnes rojas, guisos, quesos duros', cuerpo: 4, frescura: 3, taninos: 4 },
  { nombre: 'Serbal Malbec Rose Atamisque',
    nota: 'Rosado de sangrado, fresco y directo. Cerezas y frutos del bosque, boca suave y un final limpio — pensado para tomar y repetir.',
    maridaje: 'mariscos, sushi, ensaladas, quesos blandos', cuerpo: 2, frescura: 4, taninos: 1 },
  { nombre: 'Sur de Los Andes Rva Pinot Noir',
    nota: 'Pinot Noir patagónico de líneas delicadas — frutilla, frambuesa y cereza con un toque especiado, taninos sedosos y acidez elegante. 92 puntos James Suckling.',
    maridaje: 'pato, cerdo, salmón, quesos blandos', cuerpo: 2, frescura: 4, taninos: 2 },
  { nombre: 'Quieto Cabernet Franc',
    nota: 'Cabernet Franc de tres terruños de Luján de Cuyo y Tunuyán, sin paso por roble. Especias, eucalipto y pimiento rojo se cruzan con cereza; entrada suave, con mentol y frutos rojos.',
    maridaje: 'verduras asadas, carnes rojas, cerdo, pato', cuerpo: 3, frescura: 4, taninos: 3 },
  { nombre: 'Kamala Sauvignon Blanc',
    nota: 'Sauvignon Blanc de altura, cítrico y con un toque de fruta tropical y hierbas. Fresco, de buena acidez y final limpio.',
    maridaje: 'mariscos, pescados, ensaladas, quesos frescos', cuerpo: 2, frescura: 5, taninos: 1 },
  { nombre: 'Coquena Cabernet Sauvignon',
    nota: 'Cabernet Sauvignon de altura extrema en los Valles Calchaquíes — cassis y cereza negra madura, con un fondo herbal y especiado. Taninos firmes ya integrados y una persistencia larga.',
    maridaje: 'carnes rojas, estofados, cordero, quesos semiduros', cuerpo: 4, frescura: 3, taninos: 4 },
  { nombre: 'Marchiori & Barraud Chardonnay',
    nota: 'Chardonnay de Gualtallary con paso por roble — durazno blanco, pera y vainilla, entrada untuosa que la acidez mantiene equilibrada. Final largo, con un recuerdo tostado.',
    maridaje: 'paella, mariscos, pollo, pastas con crema', cuerpo: 4, frescura: 3, taninos: 1 },
  { nombre: 'Trivento Stratus Blend',
    nota: 'El corte insignia de Trivento — Malbec de tres terruños del Valle de Uco con Cabernet Franc y Merlot, 18 meses en roble francés. Fruta madura, cassis y un fondo de cacao y pimienta, con taninos sedosos y un final largo.',
    maridaje: 'carnes rojas, carnes de caza, quesos duros', cuerpo: 5, frescura: 3, taninos: 4 },
  { nombre: 'Alta Vista Alizarine Malbec',
    nota: 'Malbec de viñedo único en Las Compuertas — especias, chocolate y fruta madura con un toque salvaje. Gran estructura y taninos ya suaves, con un final larguísimo. Potencial de guarda de más de 8 años.',
    maridaje: 'carnes rojas, carnes de caza, quesos madurados', cuerpo: 5, frescura: 2, taninos: 4 },
  { nombre: 'Tapiz Alta Collection Rose',
    nota: 'Rosado de altura de San Pablo Estate — frutilla, cereza y un toque floral, entrada fresca y golosa. Pensado para tomar bien frío.',
    maridaje: 'mariscos, picoteo, postres', cuerpo: 2, frescura: 4, taninos: 1 },
  { nombre: 'Padres Ded. P.  Verdot G. Riili',
    nota: 'Petit Verdot puro de Vista Flores, 16 meses en roble francés nuevo. Especias y fruta negra sobre una estructura potente — taninos firmes, pensado para guardar.',
    maridaje: 'carnes rojas a la parrilla, quesos duros', cuerpo: 5, frescura: 3, taninos: 5 },
  { nombre: 'El Peral Merlot Uruco',
    nota: 'Merlot de un viñedo de 25 años en Tupungato — pimienta y especias sobre un fondo herbáceo y frutado. Cuerpo medio, buena acidez y un final largo y sabroso.',
    maridaje: 'carnes rojas condimentadas, platos con salsas', cuerpo: 3, frescura: 3, taninos: 3 },
  { nombre: 'Exupery Cabernet Franc Reinero',
    nota: 'Cabernet Franc de Gualtallary, frutado y herbáceo, de manejo fácil — equilibrado, con buen cuerpo y buena acidez.',
    maridaje: 'carnes rojas, quesos, picadas', cuerpo: 3, frescura: 4, taninos: 3 },
  { nombre: 'Uno Malbec Antigal',
    nota: 'Malbec de entrada suave del Valle de Uco — ciruela y cereza con violetas, especias dulces y un toque ahumado. Taninos redondos, textura aterciopelada.',
    maridaje: 'carnes rojas a la parrilla, pastas, quesos semiduros', cuerpo: 4, frescura: 3, taninos: 3 },
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
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_cuerpo)}${fila.filaSheet}`, values: [[f.cuerpo]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_frescura)}${fila.filaSheet}`, values: [[f.frescura]] });
    cambios.push({ range: `Vinos!${colLetter(cols.perfil_taninos)}${fila.filaSheet}`, values: [[f.taninos]] });
    console.log(`✓ ${f.nombre} (fila ${fila.filaSheet}) — cuerpo:${f.cuerpo} frescura:${f.frescura} taninos:${f.taninos}`);
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
