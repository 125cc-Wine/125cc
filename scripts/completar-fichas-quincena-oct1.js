#!/usr/bin/env node
// scripts/completar-fichas-quincena-oct1.js — Corrida puntual: completa
// tienda_url/imagen/nota/maridaje/perfil_* de los 12 vinos de la Quincena 1
// de octubre 2026 (arranca 01/10).
//
// Mismo criterio que los scripts de las quincenas anteriores: fuente es la
// ficha técnica real de cada producto en aromadevid.com.ar (dos casos,
// Alta Vista Albaneve Malbec y Kaiken Frankly, con ficha pobre en el sitio
// del distribuidor — se completó buscando la ficha técnica real de la
// bodega por fuera). Latente Pinot Noir Cuarto Surco no tiene ficha real
// en ningún lado — nota corta a propósito, perfil_* es el default
// razonable del varietal (mismo patrón que otros Pinot Noir del catálogo).
//
// Lorca Fantasía Criolla: el sitio del distribuidor tiene una
// inconsistencia real (nombre y categoría dicen "Criolla"/tinto, la ficha
// técnica adjunta en la misma página describe un Chardonnay blanco) —
// confirmado con el dueño (04/09/2026) cargarlo como tinto de Criolla,
// ignorando la ficha técnica mal pegada del sitio.
//
// Todas las imágenes son fotos de estudio sin recortar — correr
// scripts/recortar-fondo-vinos.js después de este script.
//
// Uso: node scripts/completar-fichas-quincena-oct1.js [--dry-run]
// Después: node scripts/recortar-fondo-vinos.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const FICHAS = [
  { nombre: 'Alta Vista Albaneve Malbec',
    tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-albaneve-malbec/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Malbec de viñedo único en Campo de los Andes, Valle de Uco — arándanos, notas tropicales de guayaba y un fondo de manteca fresca y vainilla de la crianza. Poderoso y amplio, con una acidez que lo mantiene fresco pese a la intensidad.',
    maridaje: 'carnes rojas, carnes de caza, quesos duros', cuerpo: 5, frescura: 3, taninos: 4 },
  { nombre: 'Alta Vista Estate Premium Bonarda',
    tienda_url: 'https://www.aromadevid.com.ar/producto/alta-vista-estate-premium-bonarda/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2019/04/Alta-Vista-Estate-Bonarda-scaled.jpg',
    nota: 'Bonarda pura de Valle de Uco — moras y frambuesas sobre un rojo intenso con reflejos violáceos. Taninos suaves y bien integrados, con una frescura y vivacidad que la hacen fácil de tomar.',
    maridaje: 'cerdo, pizzas, pastas, risottos, quesos suaves', cuerpo: 4, frescura: 4, taninos: 2 },
  { nombre: 'Fin Del Mundo Reserva Malbec',
    tienda_url: 'https://www.aromadevid.com.ar/producto/fin-del-mundo-reserva-malbec/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/reserva_del_fin_del_mundo_malbec_1.jpg',
    nota: 'Malbec patagónico de San Patricio del Chañar — violetas, ciruela, zarzamora, vainilla y un toque de chocolate y tabaco. Entrada frutada y amable, muy equilibrado, con la frescura característica de la Patagonia.',
    maridaje: 'asado, carnes rojas a la parrilla, estofados, quesos duros', cuerpo: 4, frescura: 4, taninos: 3 },
  { nombre: 'Flight of the Condor Chardonnay',
    tienda_url: 'https://www.aromadevid.com.ar/producto/flight-of-the-condor-chardonnay/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2025/11/image-Photoroom-37.png',
    nota: 'Chardonnay de Agrelo — pera, durazno blanco, flores cítricas y un toque de vainilla y miel. Fresco y equilibrado, de cuerpo medio y final persistente.',
    maridaje: 'mariscos, pescados en salsa, carnes blancas, pastas con salsas delicadas, quesos semicurados', cuerpo: 3, frescura: 5, taninos: 1 },
  { nombre: 'Kaiken Frankly',
    tienda_url: 'https://www.aromadevid.com.ar/producto/kaiken-frankly/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Cabernet Franc de Los Chacayes, Valle de Uco, a 1250 metros — cassis y grosellas maduras, con vainilla, pimienta negra y un fondo herbáceo. Entrada suave, textura sedosa y un final persistente con un toque mineral.',
    maridaje: 'carnes rojas, quesos, picadas', cuerpo: 4, frescura: 3, taninos: 3 },
  { nombre: 'Latente Pinot Noir Cuarto Surco',
    tienda_url: 'https://www.aromadevid.com.ar/producto/latente-pinot-noir-cuarto-surco/',
    imagen: '', // sólo placeholder en aromadevid.com.ar
    nota: 'Pinot Noir de la línea Latente de Bodega Cuarto Surco, Mendoza.',
    maridaje: 'pescados, aves, quesos blandos', cuerpo: 2, frescura: 4, taninos: 2 },
  { nombre: 'Nazareno Pinot Noir Reinero',
    tienda_url: 'https://www.aromadevid.com.ar/producto/reinero-nazareno-pinot-noir/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2023/03/Nazareno-Pinot-Noir-scaled.jpg',
    nota: 'Pinot Noir de Los Chacayes, Tupungato — fresco y vibrante, equilibrado y frutado. Maceración en frío y crianza en roble francés usado le dan taninos suaves y buena definición de acidez.',
    maridaje: 'pato, cerdo, salmón, quesos blandos', cuerpo: 3, frescura: 4, taninos: 2 },
  { nombre: 'Pulenta Estate Merlot',
    tienda_url: 'https://www.aromadevid.com.ar/producto/pulenta-estate-ii-merlot/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2020/04/Merlot-scaled.png',
    nota: 'Merlot de Agrelo — orégano, higos secos y cerezas, con un toque balsámico. Armonioso y suave, de cuerpo delicado y final agradable.',
    maridaje: 'carnes blancas especiadas, cordero, carnes de caza, quesos', cuerpo: 3, frescura: 3, taninos: 2 },
  { nombre: 'Qaramy Finca Blend',
    tienda_url: 'https://www.aromadevid.com.ar/producto/qaramy-finca-blend/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/09/QARAMY-FINCA-scaled.jpg',
    nota: 'Corte de Malbec, Cabernet Sauvignon y Syrah de Los Árboles, Valle de Uco — cada varietal fermentado por separado antes del ensamble, 12 meses en roble francés. Elegante, fresco y fácil de tomar pese a su estructura.',
    maridaje: 'carnes rojas, guisos, quesos duros', cuerpo: 4, frescura: 4, taninos: 4 },
  { nombre: 'Ricominciare Altisimo Cabernet Franc',
    tienda_url: 'https://www.aromadevid.com.ar/producto/ricominciare-altisimo-cabernet-franc/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2022/07/Ricomenciare-Altisimo-Cabernet-Franc-scaled.jpg',
    nota: 'Cabernet Franc de La Consulta, de viñedos plantados en 1986 — especiado y frutado, con una boca cremosa y especiada. Gran cuerpo, complejo y equilibrado.',
    maridaje: 'carnes condimentadas asadas, guisos', cuerpo: 5, frescura: 2, taninos: 4 },
  { nombre: 'Serbal Assemblage Atamisque',
    tienda_url: 'https://www.aromadevid.com.ar/producto/serbal-assemblage/',
    imagen: 'https://www.aromadevid.com.ar/wp-content/uploads/2026/08/SAssamblage-488x1024-1.png',
    nota: 'Corte de Tupungato — 50% Cabernet Franc, 20% Merlot, 20% Malbec, 10% Cabernet Sauvignon. Floral y especiado, con mermelada de fruta roja y un dejo de chocolate. Complejo y voluptuoso, con taninos suaves y sedosos.',
    maridaje: 'carnes rojas, pastas con salsas, empanadas, quesos estacionados', cuerpo: 5, frescura: 3, taninos: 3 },
  { nombre: 'Lorca Fantasia Criolla',
    tienda_url: 'https://www.aromadevid.com.ar/producto/lorca-fantasia-criolla/',
    imagen: '', // sin foto real confirmada
    nota: 'Criolla de Vista Flores — rojo claro y liviano, muy fresco, con taninos casi ausentes. Ideal servido bien frío.',
    maridaje: 'picadas, comidas livianas, quesos frescos', cuerpo: 1, frescura: 5, taninos: 1 },
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
