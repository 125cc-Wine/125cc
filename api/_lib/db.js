// api/_lib/db.js — cliente Postgres compartido para el módulo POS.
// Mismo rol que google-auth.js cumple para Sheets: un módulo de bajo
// nivel por servicio externo, reusado por todos los endpoints pos-*.
//
// Usa @neondatabase/serverless directamente (no @vercel/postgres, que
// Vercel deprecó a favor de esta librería tras migrar Postgres a
// integración nativa de Neon). El Pool acá se comporta igual que el
// de `pg`, y da sesiones reales para BEGIN/COMMIT/ROLLBACK.
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

// Arma el texto parametrizado ($1,$2,...) a partir de un template tag.
function buildQuery(strings, values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return text;
}

// Envuelve cualquier objeto con .query(text, values) (el Pool o un
// client del pool) como tagged template, al estilo `sql\`SELECT ...\``.
function makeSql(queryable) {
  return (strings, ...values) => queryable.query(buildQuery(strings, values), values);
}

const sql = makeSql(pool);

// Transacción real: BEGIN/COMMIT/ROLLBACK sobre una conexión dedicada
// del pool. Usar para cualquier escritura que combine más de un
// statement que deba ser atómico (ej: descontar stock + insertar ítem).
//
// Uso:
//   await withTransaction(async (client) => {
//     await client.sql`UPDATE productos SET ...`;
//     await client.sql`INSERT INTO comanda_items ...`;
//   });
async function withTransaction(fn) {
  const client = await pool.connect();
  client.sql = makeSql(client);
  try {
    await client.sql`BEGIN`;
    const result = await fn(client);
    await client.sql`COMMIT`;
    return result;
  } catch (err) {
    try {
      await client.sql`ROLLBACK`;
    } catch (_) {
      // si el rollback falla no hay mucho más para hacer; se prioriza
      // propagar el error original.
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { sql, withTransaction };
