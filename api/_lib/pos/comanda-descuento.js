// api/_lib/pos/comanda-descuento.js — aplicar o quitar un descuento
// (porcentaje o monto fijo) a una comanda abierta, antes de cobrarla.
// Se guarda como intención (tipo+valor), no como total ya calculado —
// comanda-cerrar.js es quien lo aplica sobre el subtotal real al
// momento de cobrar (que puede haber cambiado si se agregó/sacó algo).
const { sql } = require('../db');

const TIPOS = ['porcentaje', 'monto'];

async function setDescuento(req, res) {
  const { comanda_id, descuento_tipo, descuento_valor } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  // Sin tipo = quitar el descuento.
  if (!descuento_tipo) {
    const { rows } = await sql`
      UPDATE comandas SET descuento_tipo=NULL, descuento_valor=NULL
      WHERE id=${comanda_id} AND estado='abierta' RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "Comanda no encontrada o no está abierta." });
    return res.status(200).json({ ok: true });
  }

  if (!TIPOS.includes(descuento_tipo)) return res.status(400).json({ error: "Tipo de descuento inválido." });
  const valor = Number(descuento_valor);
  if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: "Valor de descuento inválido." });
  if (descuento_tipo === 'porcentaje' && valor > 100) {
    return res.status(400).json({ error: "El descuento no puede superar el 100%." });
  }

  const { rows } = await sql`
    UPDATE comandas SET descuento_tipo=${descuento_tipo}, descuento_valor=${valor}
    WHERE id=${comanda_id} AND estado='abierta'
    RETURNING id, descuento_tipo, descuento_valor`;
  if (!rows.length) return res.status(404).json({ error: "Comanda no encontrada o no está abierta." });
  return res.status(200).json({ comanda: rows[0] });
}

module.exports = { setDescuento };
