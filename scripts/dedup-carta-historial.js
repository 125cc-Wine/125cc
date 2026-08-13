#!/usr/bin/env node
// scripts/dedup-carta-historial.js — Corrida única: limpia filas duplicadas
// en carta_historial (mismo vino_id + semana_label + semana_inicio) que se
// acumularon ANTES de que guardarHistorialCarta() fuera idempotente — cada
// "Guardar carta" reinsertaba TODO lo que estaba puesto en pantalla, sin
// chequear qué ya existía. Se queda con la fila más vieja (primera vez que
// se confirmó ese vino en esa quincena) y borra las repeticiones más nuevas.
//
// Uso: node scripts/dedup-carta-historial.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { sql } = require('../api/_lib/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const { rows: grupos } = await sql`
    SELECT vino_id, vino_nombre, semana_label, semana_inicio, COUNT(*) c, MIN(id) mantener
    FROM carta_historial
    GROUP BY vino_id, vino_nombre, semana_label, semana_inicio
    HAVING COUNT(*) > 1
    ORDER BY semana_inicio DESC
  `;

  if (!grupos.length) {
    console.log('No hay duplicados — nada para limpiar.');
    return;
  }

  console.log(`${grupos.length} vino(s) duplicados en carta_historial:`);
  grupos.forEach(g => console.log(`  ${g.semana_inicio.toISOString().slice(0,10)} ${g.semana_label} — ${g.vino_nombre} x${g.c} (se conserva id ${g.mantener})`));

  if (DRY_RUN) {
    console.log('\n(dry-run: no se borró nada)');
    return;
  }

  const { rowCount } = await sql`
    DELETE FROM carta_historial a
    USING carta_historial b
    WHERE a.id > b.id
      AND a.vino_id = b.vino_id
      AND a.semana_label = b.semana_label
      AND a.semana_inicio = b.semana_inicio
  `;
  console.log(`\n✓ Borradas ${rowCount} filas duplicadas.`);
}

main().catch(err => { console.error(err); process.exit(1); });
