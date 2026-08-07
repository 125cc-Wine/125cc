// api/_lib/db.js — cliente Postgres compartido para el módulo POS.
// Mismo rol que google-auth.js cumple para Sheets: un módulo de bajo
// nivel por servicio externo, reusado por todos los endpoints pos-*.
const { sql, db } = require('@vercel/postgres');

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
  const client = await db.connect();
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

module.exports = { sql, db, withTransaction };
