-- Auditoría v2, C6: comanda_items congela precio_unitario pero no el
-- costo — el costo variable de un mes ya CERRADO se recalculaba con el
-- costo de HOY. Aplicar un precio de proveedor nuevo en septiembre
-- reescribía el margen de julio hacia abajo, un mes que ya se reportó.
-- No migra histórico: las filas viejas quedan en NULL y las queries
-- caen a productos.costo como hasta ahora (mismo criterio que
-- anulado_at).
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS costo_snapshot numeric(12,4);
