// api/_lib/pos/stock-unidades.js — cuánto stock (en unidades de COMPRA,
// botellas) consume/restituye una unidad vendida de un producto.
//
// Stock por botella, venta por copa: el stock físico se cuenta en
// botellas, no en copas — un producto unidad_venta='copa' consume
// 1/copas_por_botella de una botella por cada copa (125cc de copa /
// 750cc de botella = 1/6, hoy uniforme en todo el catálogo). 'botella' y
// 'unidad' consumen 1 unidad entera de stock por venta, sin conversión.
//
// Factorizado (auditoría v2, A1) de comanda-item.js, que ya lo resolvía
// bien, para que comanda-anular.js use la misma cuenta al restituir
// stock en vez de una copia que puede divergir — antes anular una
// comanda con copas cargadas restituía unidades enteras de botella por
// cada copa (3 copas anuladas devolvían 3 botellas en vez de media).
function consumoStock(producto) {
  return producto.unidad_venta === 'copa'
    ? 1 / Number(producto.copas_por_botella || 6)
    : 1;
}

// Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md), Tier 1 — el
// hallazgo principal del análisis: vender un plato con receta NO tocaba
// el stock de sus insumos en absoluto (esta función no existía, nada la
// llamaba). insumos.stock_actual era un número decorativo que solo se
// movía si alguien lo editaba a mano — sin este vínculo no hay forma de
// comparar "lo que debería haberse consumido según lo vendido" contra
// "lo que realmente queda", que es la base de cualquier costeo real.
//
// unidadesDelta: cuántas UNIDADES DE VENTA del producto cambiaron —
// positivo al vender (resta insumos), negativo al restar/anular una
// línea (restituye insumos). Debe llamarse DENTRO de la misma
// transacción que ya toca comanda_items/productos.stock_actual (mismo
// patrón que esas funciones: FOR UPDATE por fila para que dos ventas
// simultáneas no pisen el descuento una de la otra).
//
// receta_items.cantidad está en unidad de RECETA de cada insumo (ej.
// gramos); insumos.stock_actual se trackea en unidad de COMPRA (ej. kg,
// mismo criterio que productos.stock_actual con copas_por_botella) — se
// divide por factor_receta para pasar de una a la otra. Insumos sin
// stock trackeado (stock_actual NULL) se saltean, igual que productos.
async function ajustarStockInsumosPorReceta(client, productoId, unidadesDelta) {
  const { rows: items } = await client.sql`
    SELECT insumo_id, cantidad FROM receta_items WHERE producto_id = ${productoId}`;
  if (!items.length) return;
  for (const item of items) {
    const { rows: insumoRows } = await client.sql`
      SELECT stock_actual, factor_receta FROM insumos WHERE id = ${item.insumo_id} FOR UPDATE`;
    if (!insumoRows.length || insumoRows[0].stock_actual == null) continue;
    const consumoEnUnidadCompra = (Number(item.cantidad) * unidadesDelta) / Number(insumoRows[0].factor_receta || 1);
    await client.sql`
      UPDATE insumos SET stock_actual = stock_actual - ${consumoEnUnidadCompra}, updated_at = now()
      WHERE id = ${item.insumo_id}`;
  }
}

module.exports = { consumoStock, ajustarStockInsumosPorReceta };
