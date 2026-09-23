#!/usr/bin/env node
// scripts/correr-calendario-un-mes.js — Corrida puntual (23/09/2026): corre
// TODO el Calendario de Carta (carta_historial.semana_inicio) un mes hacia
// adelante. El bar no llegó a abrir en septiembre, así que ninguna de las
// dos quincenas de septiembre se usó — en vez de descartarlas se corre el
// calendario completo: 01/09→01/10, 16/09→16/10, …, 16/11→16/12.
//
// semana_label ('Quincena 1'/'Quincena 2') no cambia: sumar un mes mantiene
// el día (01 o 16), así que cada fila sigue siendo la misma mitad del mes.
// Hasta el 30/09 la quincena vigente (16/09) queda sin registro — por la
// salvedad de obtener-vinos.js el menú cae a "solo completitud" en vez de
// quedar en blanco.
//
// Antes de escribir guarda un backup JSON de la tabla completa en
// scripts/backups/ (ignorado por git).
//
// Uso: node scripts/correr-calendario-un-mes.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), quiet: true });
const fs = require('fs');
const path = require('path');
const { sql } = require('../api/_lib/db');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const { rows } = await sql`SELECT * FROM carta_historial ORDER BY semana_inicio, id`;

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `carta_historial-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify(rows, null, 2));
  console.log(`Backup: ${archivo} (${rows.length} filas)`);

  const antes = await sql`
    SELECT semana_inicio::text AS desde, (semana_inicio + interval '1 month')::date::text AS hasta, count(*)::int AS n
    FROM carta_historial GROUP BY semana_inicio ORDER BY semana_inicio`;
  antes.rows.forEach((r) => console.log(`  ${r.desde} → ${r.hasta}  (${r.n} vinos)`));

  if (DRY_RUN) { console.log('\n--dry-run: no se escribió nada.'); process.exit(0); }

  const res = await sql`UPDATE carta_historial SET semana_inicio = (semana_inicio + interval '1 month')::date`;
  console.log(`\n✓ ${res.rowCount} filas corridas un mes.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
