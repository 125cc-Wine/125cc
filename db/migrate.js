// db/migrate.js — aplica migraciones nuevas de db/migrations/*.sql
// contra la DB real, en orden, registrando cada una en
// schema_migrations para no volver a aplicarla dos veces.
//
// db/schema.sql sigue siendo la ÚNICA fuente de verdad del schema
// completo (la "foto" de cómo se ve todo hoy) — esto no lo reemplaza,
// es el historial de CÓMO se llegó ahí. Cada migración nueva también
// se pega al final de schema.sql (mismo criterio de siempre), para que
// alguien que lee schema.sql de punta a punta siga viendo el estado
// completo sin tener que reconstruirlo desde los archivos de
// db/migrations/.
//
// Uso: node db/migrate.js
const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { sql, withTransaction } = require('../api/_lib/db');

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) {
    console.log('No existe db/migrations/ — nada para aplicar.');
    process.exit(0);
  }

  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows: aplicadas } = await sql`SELECT id FROM schema_migrations`;
  const yaAplicadas = new Set(aplicadas.map((r) => r.id));
  const pendientes = archivos.filter((f) => !yaAplicadas.has(f));

  if (!pendientes.length) {
    console.log(`Nada pendiente (${archivos.length} migración(es) ya aplicada(s)).`);
    process.exit(0);
  }

  for (const archivo of pendientes) {
    const contenido = fs.readFileSync(path.join(dir, archivo), 'utf8');
    // Separado por ';' — el driver no soporta multi-statement en una
    // sola query, cada sentencia se manda por separado dentro de la
    // misma transacción.
    const statements = contenido.split(';').map((s) => s.trim()).filter(Boolean);
    console.log(`Aplicando ${archivo} (${statements.length} sentencia(s))...`);
    await withTransaction(async (client) => {
      for (const stmt of statements) {
        // client.sql espera tagged-template (strings, ...values); pasar
        // un array de un elemento como "strings" y sin values reproduce
        // exactamente lo mismo que sql`${stmt}` haría con texto plano —
        // válido para DDL sin parámetros, que es todo lo que vive acá.
        await client.sql([stmt]);
      }
      await client.sql`INSERT INTO schema_migrations (id) VALUES (${archivo})`;
    });
    console.log(`  OK`);
  }

  console.log(`${pendientes.length} migración(es) aplicada(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
