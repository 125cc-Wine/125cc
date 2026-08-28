// api/_lib/pos/comanda-item.js — agregar/restar/anular un ítem de una
// comanda abierta. Cada producto ocupa una sola línea mientras esté
// activo: agregar el mismo producto de nuevo suma a esa línea (stepper
// +/− en la UI) en vez de crear filas duplicadas. Precio/nombre quedan
// "congelados" al momento de la primera venta de esa línea.
//
// Stock (Fase 2): si el producto trackea stock (stock_actual no nulo),
// cada +1/−1 de línea descuenta/restaura stock_actual en la MISMA
// transacción que el cambio de comanda_items, con SELECT ... FOR UPDATE
// para que dos mozos no puedan vender la última unidad a la vez. Sin
// stock disponible devuelve 409 (advisory, no bloqueo duro — el body
// {forzar:true} permite cargar igual, por si se abrió una botella nueva
// que todavía no se registró).
//
// Stock por botella, venta por copa: el stock físico se cuenta en
// botellas, no en copas — un producto unidad_venta='copa' descuenta
// 1/copas_por_botella de una botella por cada copa vendida (125cc de
// copa / 750cc de botella = 1/6, hoy uniforme en todo el catálogo).
// 'botella' y 'unidad' siguen consumiendo 1 unidad entera de stock por
// venta, sin cambios — ahí el stock ya coincidía con lo que se vendía.
//
// El chequeo de "la comanda está abierta" se hace CON SELECT...FOR
// UPDATE sobre comandas, adentro de la misma transacción — antes era
// un SELECT suelto ANTES de abrir la transacción, así que entre ese
// chequeo y el resto de la operación otro dispositivo podía cerrar la
// comanda (comanda-cerrar.js sí lockea comandas) y el ítem terminaba
// entrando en una comanda ya cobrada, con el stock descontado sin que
// nadie pagara esa venta.
const { withTransaction } = require('../db');
const { consumoStock, ajustarStockInsumosPorReceta } = require('./stock-unidades');

// Tolerancia para el chequeo de "hay stock": 1/6 no es representable
// exacto en decimal, así que restar esa fracción muchas veces (una
// botella entera son 6 copas) acumula un residuo de redondeo minúsculo
// (~0.000001 por copa). Sin margen, ese residuo termina bloqueando la
// última copa legítima de una botella con "sin stock" siendo falso.
const EPSILON_STOCK = 0.001;

// Lockea y valida la comanda al principio de cualquier transacción de
// este archivo — lanza un error con código para que el catch de cada
// rama lo traduzca al status HTTP correcto.
async function lockearComandaAbierta(client, comandaId) {
  const { rows } = await client.sql`SELECT estado FROM comandas WHERE id=${comandaId} FOR UPDATE`;
  if (!rows.length) throw Object.assign(new Error('no_comanda'), { code: 'no_comanda' });
  if (rows[0].estado !== 'abierta') throw Object.assign(new Error('comanda_cerrada'), { code: 'comanda_cerrada' });
}

async function comandaItem(req, res) {
  const { comanda_id, accion, registrado_por, motivo } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  // Anular: saca la línea entera y restaura todo el stock de esa línea.
  // anulado_at/anulado_por se capturan siempre (sin fricción nueva, el
  // botón ✕ del frontend sigue siendo un solo toque); motivo es
  // opcional y hoy nadie lo manda desde la UI, queda listo para cuando
  // haga falta pedirlo.
  if (accion === 'anular') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    try {
      await withTransaction(async (client) => {
        await lockearComandaAbierta(client, comanda_id);

        const { rows: itemRows } = await client.sql`
          SELECT ci.id, ci.producto_id, ci.cantidad, p.unidad_venta, p.copas_por_botella
          FROM comanda_items ci JOIN productos p ON p.id = ci.producto_id
          WHERE ci.id=${item_id} AND ci.comanda_id=${comanda_id} AND ci.estado='activo'
          FOR UPDATE OF ci`;
        if (!itemRows.length) throw Object.assign(new Error('no_item'), { code: 'no_item' });
        await client.sql`
          UPDATE comanda_items SET estado='anulado', anulado_at=now(), anulado_por=${registrado_por || null}, motivo_anulacion=${motivo || null}
          WHERE id=${item_id}`;
        const restituir = itemRows[0].cantidad * consumoStock(itemRows[0]);
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + ${restituir}
          WHERE id=${itemRows[0].producto_id} AND stock_actual IS NOT NULL`;
        // Costeo de insumos, Tier 1: restituye el stock de los insumos de
        // la receta por TODA la cantidad anulada (delta negativo = se
        // devuelve al stock, ver stock-unidades.js).
        await ajustarStockInsumosPorReceta(client, itemRows[0].producto_id, -itemRows[0].cantidad);
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
      if (err.code === 'comanda_cerrada') return res.status(409).json({ error: "La comanda no está abierta." });
      if (err.code === 'no_item') return res.status(404).json({ error: "Ítem no encontrado o ya anulado." });
      throw err;
    }
  }

  // Restar 1 unidad (botón −); si llega a 0, anula la línea. Restaura 1
  // unidad de stock.
  if (accion === 'restar') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    try {
      await withTransaction(async (client) => {
        await lockearComandaAbierta(client, comanda_id);

        const { rows: itemRows } = await client.sql`
          SELECT ci.cantidad, ci.producto_id, p.unidad_venta, p.copas_por_botella
          FROM comanda_items ci JOIN productos p ON p.id = ci.producto_id
          WHERE ci.id=${item_id} AND ci.comanda_id=${comanda_id} AND ci.estado='activo' FOR UPDATE OF ci`;
        if (!itemRows.length) throw Object.assign(new Error('no_item'), { code: 'no_item' });
        const nuevaCant = itemRows[0].cantidad - 1;
        if (nuevaCant <= 0) {
          await client.sql`
            UPDATE comanda_items SET estado='anulado', anulado_at=now(), anulado_por=${registrado_por || null}
            WHERE id=${item_id}`;
        } else {
          await client.sql`UPDATE comanda_items SET cantidad=${nuevaCant} WHERE id=${item_id}`;
        }
        const restituir = consumoStock(itemRows[0]);
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + ${restituir}
          WHERE id=${itemRows[0].producto_id} AND stock_actual IS NOT NULL`;
        // Costeo de insumos, Tier 1: restituye 1 unidad vendida menos.
        await ajustarStockInsumosPorReceta(client, itemRows[0].producto_id, -1);
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
      if (err.code === 'comanda_cerrada') return res.status(409).json({ error: "La comanda no está abierta." });
      if (err.code === 'no_item') return res.status(404).json({ error: "Ítem no encontrado." });
      throw err;
    }
  }

  // Agregar 1 unidad (botón + / tocar un producto del picker): descuenta
  // stock si corresponde, y suma a la línea activa de ese producto si ya
  // existe, si no crea una nueva.
  const { producto_id, forzar } = req.body || {};
  if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });

  try {
    const item = await withTransaction(async (client) => {
      await lockearComandaAbierta(client, comanda_id);

      const { rows: prodRows } = await client.sql`
        SELECT nombre, precio, costo, stock_actual, unidad_venta, copas_por_botella
        FROM productos WHERE id=${producto_id} FOR UPDATE`;
      if (!prodRows.length) throw Object.assign(new Error('no_producto'), { code: 'no_producto' });
      const producto = prodRows[0];

      if (producto.stock_actual != null) {
        const consumo = consumoStock(producto);
        if (producto.stock_actual < consumo - EPSILON_STOCK && !forzar) {
          throw Object.assign(new Error('sin_stock'), { code: 'sin_stock', disponible: producto.stock_actual });
        }
        await client.sql`UPDATE productos SET stock_actual = stock_actual - ${consumo} WHERE id=${producto_id}`;
      }
      // Costeo de insumos, Tier 1: se vendió 1 unidad más — descuenta el
      // stock de cada insumo de la receta (si el producto no tiene
      // receta, ajustarStockInsumosPorReceta no encuentra filas y no
      // hace nada). Nunca bloquea la venta por falta de stock de un
      // insumo (a diferencia del stock del producto arriba) — mismo
      // criterio permisivo que ya usan las mermas: es un número
      // informativo para saber qué reponer, no un candado de venta.
      await ajustarStockInsumosPorReceta(client, producto_id, 1);

      const { rows: existentes } = await client.sql`
        SELECT id, cantidad FROM comanda_items
        WHERE comanda_id=${comanda_id} AND producto_id=${producto_id} AND estado='activo'`;

      if (existentes.length) {
        const { rows } = await client.sql`
          UPDATE comanda_items SET cantidad = cantidad + 1
          WHERE id=${existentes[0].id}
          RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
        return rows[0];
      }
      // costo_snapshot (auditoría v2, C6): congela el costo al momento
      // de la venta, igual que ya se hace con precio_unitario — sin
      // esto, el costo variable de un mes ya cerrado se recalcula con
      // el costo de HOY cada vez que se corre el reporte, y aplicar un
      // precio de proveedor nuevo reescribe hacia atrás el margen de
      // meses que ya se reportaron.
      const { rows } = await client.sql`
        INSERT INTO comanda_items (comanda_id, producto_id, nombre_snapshot, precio_unitario, costo_snapshot, cantidad)
        VALUES (${comanda_id}, ${producto_id}, ${producto.nombre}, ${producto.precio}, ${producto.costo}, 1)
        RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
      return rows[0];
    });
    return res.status(201).json({ item });
  } catch (err) {
    if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'comanda_cerrada') return res.status(409).json({ error: "La comanda no está abierta." });
    if (err.code === 'no_producto') return res.status(404).json({ error: "Producto no encontrado." });
    if (err.code === 'sin_stock') {
      return res.status(409).json({ error: "Sin stock disponible.", disponible: err.disponible });
    }
    throw err;
  }
}

module.exports = { comandaItem };
