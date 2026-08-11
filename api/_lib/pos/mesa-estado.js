// api/_lib/pos/mesa-estado.js — override manual del estado de una mesa
// (ej: destrabar una mesa que quedó "ocupada" sin comanda por un error).
//
// Al pasar a 'cuenta_pedida' se marca comandas.cuenta_pedida_at en la
// comanda abierta de esa mesa — es el timestamp que usa el frontend
// para el aviso de "hace cuánto se pidió la cuenta" en el pin del
// plano (ver mesas.js listMesas). No se limpia al salir de ese estado:
// una comanda nueva en esa mesa arranca con cuenta_pedida_at NULL de
// nuevo, así que no hace falta.
const { withTransaction } = require('../db');

const ESTADOS = ['libre', 'ocupada', 'cuenta_pedida'];

async function setMesaEstado(req, res) {
  const { id, estado } = req.body || {};
  if (!id || !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: "Falta id o estado inválido." });
  }

  try {
    const mesa = await withTransaction(async (client) => {
      // Auditoría v2, B4: pasar a 'libre' con una comanda todavía
      // abierta dejaría el plano mintiendo (mesa verde, venta en curso)
      // y la mesa imposible de reabrir después — one_open_comanda_per_mesa
      // rechaza una comanda nueva mientras la vieja siga 'abierta'. El
      // override tiene que cerrar/anular la comanda primero, no solo
      // pintar la mesa. Verificado: hoy no hay ningún llamado desde
      // pos.html que mande estado:'libre' (el único caller manda
      // 'cuenta_pedida'), así que este chequeo no cambia ningún flujo
      // en uso — es un candado para cuando exista uno.
      if (estado === 'libre') {
        const { rows: abiertas } = await client.sql`
          SELECT id FROM comandas WHERE mesa_id=${id} AND estado='abierta' FOR UPDATE`;
        if (abiertas.length) {
          throw Object.assign(new Error('comanda_abierta'), { code: 'comanda_abierta', comandaId: abiertas[0].id });
        }
      }

      const { rows } = await client.sql`
        UPDATE mesas SET estado = ${estado}, updated_at = now()
        WHERE id = ${id} RETURNING id, nombre, estado`;
      if (!rows.length) throw Object.assign(new Error('no_mesa'), { code: 'no_mesa' });

      if (estado === 'cuenta_pedida') {
        await client.sql`
          UPDATE comandas SET cuenta_pedida_at = now()
          WHERE mesa_id = ${id} AND estado = 'abierta'`;
      }
      return rows[0];
    });
    return res.status(200).json({ mesa });
  } catch (err) {
    if (err.code === 'no_mesa') return res.status(404).json({ error: "Mesa no encontrada." });
    if (err.code === 'comanda_abierta') {
      return res.status(409).json({
        error: "La mesa tiene una comanda abierta. Cobrala o anulala para liberarla.",
        comanda_id: err.comandaId,
      });
    }
    throw err;
  }
}

module.exports = { setMesaEstado };
