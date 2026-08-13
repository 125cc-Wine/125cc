#!/usr/bin/env node
// scripts/dedup-vinos-sheet.js — Corrida única: limpia los borradores
// duplicados que quedaron en la pestaña "Vinos" del Sheet por el mismo
// incidente que causó los duplicados en carta_historial (ver
// scripts/dedup-carta-historial.js) — cada "Guardar carta" viejo (antes de
// que fuera idempotente) volvía a llamar cartaCrearBorradorSheet() para
// vinos del catálogo externo que YA tenían un borrador creado en un
// guardado anterior, si el chequeo "¿ya existe en el Sheet?" corría contra
// una copia de cartaWines desactualizada (ej. Cache-Control de 30s en
// /api/obtener-vinos sirviendo una respuesta vieja al navegador).
//
// Identifica duplicados por (nombre, bodega) normalizados ENTRE FILAS SIN
// NOTA (nota vacía = borrador auto-creado, nunca completado a mano — los 14
// vinos originales curados a mano siempre tienen nota, nunca se tocan acá).
// Para cada grupo duplicado, conserva la fila con el id MÁS CHICO (la
// primera vez que se creó) y borra el resto. Esto también resuelve solo,
// como efecto colateral, las 8 colisiones de id encontradas (dos vinos
// DISTINTOS con el mismo id) — en los 8 casos, la fila que sobra en la
// colisión es justo la que este mismo criterio ya marca para borrar.
//
// Uso: node scripts/dedup-vinos-sheet.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { getReadWriteToken } = require('../api/_lib/google-auth');

const DRY_RUN = process.argv.includes('--dry-run');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const token = await getReadWriteToken(process.env.GOOGLE_CLIENT_EMAIL, process.env.GOOGLE_PRIVATE_KEY);

  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await dataRes.json();
  const rows = data.values || [];
  const headers = rows[0];
  const colIdx = name => headers.findIndex(h => h.toLowerCase().replace(/\s+/g, '_') === name);
  const iId = colIdx('id'), iNombre = colIdx('nombre'), iBodega = colIdx('bodega'), iNota = colIdx('nota');

  const filas = rows.slice(1).map((r, i) => ({
    filaSheet: i + 2, // 1-indexed, +1 por el header
    id: r[iId], nombre: r[iNombre] || '', bodega: r[iBodega] || '', nota: r[iNota] || '',
  }));

  const drafts = filas.filter(f => !f.nota.trim());
  const grupos = new Map();
  drafts.forEach(f => {
    const key = `${norm(f.nombre)}|${norm(f.bodega)}`;
    (grupos.get(key) || grupos.set(key, []).get(key)).push(f);
  });

  const aBorrar = [];
  for (const [key, arr] of grupos) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
    const [conservar, ...sobrantes] = arr;
    console.log(`${arr.length}x "${conservar.nombre}" (${conservar.bodega}) — conserva fila ${conservar.filaSheet} (id ${conservar.id}), borra: ${sobrantes.map(s => `fila ${s.filaSheet} (id ${s.id})`).join(', ')}`);
    aBorrar.push(...sobrantes);
  }

  console.log(`\nTotal filas a borrar: ${aBorrar.length}`);
  if (!aBorrar.length) { console.log('Nada para limpiar.'); return; }

  // Verificación: después de borrar estas filas, ¿queda algún id repetido
  // entre las filas que SOBREVIVEN? Si sí, no se borra nada — hay que
  // revisar a mano en vez de arriesgar dejar una colisión sin resolver.
  const filasSobrevivientesIds = filas
    .filter(f => !aBorrar.some(b => b.filaSheet === f.filaSheet))
    .map(f => f.id);
  const conteo = {};
  filasSobrevivientesIds.forEach(id => { conteo[id] = (conteo[id] || 0) + 1; });
  const colisionesRestantes = Object.entries(conteo).filter(([, c]) => c > 1);
  if (colisionesRestantes.length) {
    console.error('\n✗ ABORTADO: quedarían colisiones de id sin resolver:', colisionesRestantes);
    process.exit(1);
  }
  console.log('✓ Verificado: no quedan ids colisionando después de este borrado.');

  if (DRY_RUN) { console.log('\n(dry-run: no se borró nada)'); return; }

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } });
  const meta = await metaRes.json();
  const sheetId = meta.sheets.find(s => s.properties.title === 'Vinos').properties.sheetId;

  // Borrar de mayor a menor índice de fila — si no, cada deleteDimension
  // corre los índices de las filas siguientes y los requests posteriores
  // apuntarían a la fila equivocada.
  const requests = aBorrar
    .map(f => f.filaSheet)
    .sort((a, b) => b - a)
    .map(filaSheet => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: filaSheet - 1, endIndex: filaSheet } },
    }));

  const delRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!delRes.ok) throw new Error(`Error borrando filas: ${await delRes.text()}`);

  console.log(`\n✓ Borradas ${aBorrar.length} filas duplicadas del Sheet.`);
}

main().catch(err => { console.error(err); process.exit(1); });
