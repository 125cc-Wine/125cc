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
    throw err;
  }
}

module.exports = { setMesaEstado };
