#!/usr/bin/env node
// scripts/correr-calendario-quincenas.js — Corre TODO el Calendario de Carta
// (carta_historial.semana_inicio) N quincenas hacia adelante. Generaliza
// correr-calendario-un-mes.js, que sólo sabía correr de a un mes (2
// quincenas) porque sumaba `interval '1 month'`.
//
// Primer uso (19/10/2026): la apertura del bar se pasó a la segunda
// quincena de noviembre, así que la carta del 01/10 tiene que salir el
// 16/11 — 3 quincenas: 01/10→16/11, 16/10→01/12, 01/11→16/12, 16/11→01/01,
// 01/12→16/01, 16/12→01/02.
//
// Con un N impar cada fila cambia de mitad del mes, así que también se
// reescribe semana_label ('Quincena 1' si arranca el 01, 'Quincena 2' si
// arranca el 16). confirmado_at no se toca: el bloqueo de 12 meses sigue
// contando desde que se confirmó cada vino.
//
// Antes de escribir guarda un backup JSON de la tabla completa en
// scripts/backups/ (ignorado por git).
//
// Uso: node scripts/correr-calendario-quincenas.js <N> [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), quiet: true });
const fs = require('fs');
const path = require('path');
const { sql } = require('../api/_lib/db');

const DRY_RUN = process.argv.includes('--dry-run');
const N = parseInt(process.argv.slice(2).find((a) => /^-?\d+$/.test(a)), 10);
if (!N) { console.error('Uso: node scripts/correr-calendario-quincenas.js <N> [--dry-run]'); process.exit(1); }

// Índice de quincena (2 por mes) → fecha de arranque. Mismo cálculo en JS
// (para el dry-run) y en SQL (para el UPDATE).
const idxDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (y * 12 + m - 1) * 2 + (d >= 16 ? 1 : 0); };
const fechaDe = (idx) => {
  const mesAbs = Math.floor(idx / 2);
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(mesAbs / 12)}-${pad((mesAbs % 12) + 1)}-${idx % 2 ? '16' : '01'}`;
};

(async () => {
  const { rows } = await sql`SELECT * FROM carta_historial ORDER BY semana_inicio, id`;

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `carta_historial-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify(rows, null, 2));
  console.log(`Backup: ${archivo} (${rows.length} filas)`);

  const antes = await sql`
    SELECT semana_inicio::text AS desde, count(*)::int AS n
    FROM carta_historial GROUP BY semana_inicio ORDER BY semana_inicio`;
  antes.rows.forEach((r) => console.log(`  ${r.desde} → ${fechaDe(idxDe(r.desde) + N)}  (${r.n} vinos)`));

  if (DRY_RUN) { console.log('\n--dry-run: no se escribió nada.'); process.exit(0); }

  const res = await sql`
    WITH x AS (
      SELECT id, (EXTRACT(YEAR FROM semana_inicio)::int * 12 + EXTRACT(MONTH FROM semana_inicio)::int - 1) * 2
               + CASE WHEN EXTRACT(DAY FROM semana_inicio) >= 16 THEN 1 ELSE 0 END + ${N}::int AS idx
      FROM carta_historial
    )
    UPDATE carta_historial c
    SET semana_inicio = make_date(x.idx / 24, (x.idx / 2) % 12 + 1, CASE WHEN x.idx % 2 = 1 THEN 16 ELSE 1 END),
        semana_label  = CASE WHEN x.idx % 2 = 1 THEN 'Quincena 2' ELSE 'Quincena 1' END
    FROM x WHERE x.id = c.id`;
  console.log(`\n✓ ${res.rowCount} filas corridas ${N} quincena${N === 1 ? '' : 's'}.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
