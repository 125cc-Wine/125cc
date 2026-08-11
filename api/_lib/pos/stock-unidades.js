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

module.exports = { consumoStock };
