-- Auditoría v2, A3: la cortesía de la casa (100% de descuento) se cierra
-- como venta a $0 en vez de forzar una anulación, que restituye stock y
-- borra el costo del estado de resultados. Necesita un valor nuevo en el
-- CHECK de comandas.medio_pago.
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_medio_pago_check;
ALTER TABLE comandas ADD CONSTRAINT comandas_medio_pago_check
  CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','mixto','cuenta_corriente','cortesia'));
