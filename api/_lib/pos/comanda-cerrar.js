// api/_lib/pos/comanda-cerrar.js — cobrar y cerrar una comanda:
// 1) el subtotal se calcula server-side desde los ítems activos (nunca
//    se confía en un total mandado por el cliente),
// 2) se le aplica el descuento de la comanda (si tiene) para obtener el
//    total final,
// 3) se acepta uno o varios pagos (pagos: [{medio_pago, monto}]) que
//    deben sumar el total — así se soporta tanto un cobro simple como
//    dividir la cuenta entre varios medios/personas,
// 4) exige una caja abierta y escribe un movimiento de venta por cada
//    pago, todo en la misma transacción que el cierre de la comanda y
//    la liberación de la mesa.
const { withTransaction } = require('../db');

// Medios válidos para un pago individual — 'mixto' no es un medio real,
// es lo que queda anotado en comandas.medio_pago cuando hay más de un pago.
const PAGO_MEDIOS = ['efectivo', 'tarjeta', 'transferencia'];
const MEDIO_A_CAJA = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia' };

function aplicarDescuento(subtotal, tipo, valor) {
  if (!tipo || valor == null) return subtotal;
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return subtotal;
  const total = tipo === 'porcentaje' ? subtotal * (1 - v / 100) : subtotal - v;
  return Math.max(0, Math.round(total));
}

async function cerrarComanda(req, res) {
  const { comanda_id } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: sesiones } = await client.sql`
        SELECT id FROM caja_sesiones WHERE estado='abierta' LIMIT 1`;
      if (!sesiones.length) throw Object.assign(new Error('sin_caja'), { code: 'sin_caja' });

      const { rows: openRows } = await client.sql`
        SELECT id, mesa_id, estado, descuento_tipo, descuento_valor
        FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!openRows.length) throw Object.assign(new Error('not_found'), { code: 'not_found' });
      if (openRows[0].estado !== 'abierta') throw Object.assign(new Error('not_open'), { code: 'not_open' });

      const { rows: totalRows } = await client.sql`
        SELECT COALESCE(SUM(precio_unitario * cantidad), 0) AS subtotal
        FROM comanda_items WHERE comanda_id=${comanda_id} AND estado='activo'`;
      const subtotal = Number(totalRows[0].subtotal);
      if (subtotal <= 0) throw Object.assign(new Error('sin_items'), { code: 'sin_items' });

      const total = aplicarDescuento(subtotal, openRows[0].descuento_tipo, openRows[0].descuento_valor);

      // Normalizar pagos: acepta {pagos:[...]} o, por compatibilidad,
      // {medio_pago} suelto como un único pago por el total.
      let pagos = req.body.pagos;
      if (!Array.isArray(pagos) || !pagos.length) {
        if (!PAGO_MEDIOS.includes(req.body.medio_pago)) {
          throw Object.assign(new Error('bad_request'), { code: 'bad_request', msg: "Falta medio_pago o pagos." });
        }
        pagos = [{ medio_pago: req.body.medio_pago, monto: total }];
      }

      let sumaPagos = 0;
      for (const p of pagos) {
        if (!PAGO_MEDIOS.includes(p.medio_pago)) {
          throw Object.assign(new Error('bad_request'), { code: 'bad_request', msg: "Medio de pago inválido en un pago." });
        }
        const m = Number(p.monto);
        if (!Number.isFinite(m) || m <= 0) {
          throw Object.assign(new Error('bad_request'), { code: 'bad_request', msg: "Monto inválido en un pago." });
        }
        sumaPagos += m;
      }
      // Tolerancia de $1 por redondeos de splits (ej: total 1001 / 2 partes).
      if (Math.abs(sumaPagos - total) > 1) {
        throw Object.assign(new Error('descuadre'), { code: 'descuadre', total, sumaPagos });
      }

      const medioFinal = pagos.length > 1 ? 'mixto' : pagos[0].medio_pago;

      const { rows } = await client.sql`
        UPDATE comandas SET estado='cerrada', medio_pago=${medioFinal}, total=${total}, cerrada_at=now()
        WHERE id=${comanda_id}
        RETURNING id, mesa_id, estado, medio_pago, total, cerrada_at`;

      if (openRows[0].mesa_id) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${openRows[0].mesa_id}`;
      }

      for (const p of pagos) {
        await client.sql`
          INSERT INTO caja_movimientos (caja_sesion_id, tipo, comanda_id, medio_pago, monto)
          VALUES (${sesiones[0].id}, 'venta', ${comanda_id}, ${MEDIO_A_CAJA[p.medio_pago]}, ${p.monto})`;
      }

      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'sin_caja') return res.status(409).json({ error: "No hay una caja abierta. Abrí la caja antes de cobrar." });
    if (err.code === 'not_found') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'not_open') return res.status(409).json({ error: "La comanda ya está cerrada o anulada." });
    if (err.code === 'sin_items') return res.status(409).json({ error: "La comanda no tiene ítems activos para cobrar." });
    if (err.code === 'bad_request') return res.status(400).json({ error: err.msg });
    if (err.code === 'descuadre') {
      return res.status(400).json({ error: `Los pagos ($${err.sumaPagos}) no cubren el total ($${err.total}).` });
    }
    throw err;
  }
}

module.exports = { cerrarComanda };
