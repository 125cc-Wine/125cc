-- Auditoría v2, C1: receta_items no tenía índice único por
-- (producto_id, insumo_id) — cargar el mismo insumo dos veces en una
-- receta crea dos filas y recalcularCostoReceta suma las dos, inflando
-- el costo calculado sin nada que lo señale. Verificado antes de
-- aplicar: 0 filas en receta_items en producción (todavía no se cargó
-- ningún plato), así que el UPDATE/DELETE de abajo son no-ops seguros
-- — se dejan igual por si esto se corre más adelante con datos reales.
UPDATE receta_items ri SET cantidad = t.total
FROM (SELECT producto_id, insumo_id, SUM(cantidad) AS total, MIN(id) AS keep_id
      FROM receta_items GROUP BY producto_id, insumo_id HAVING COUNT(*) > 1) t
WHERE ri.id = t.keep_id;

DELETE FROM receta_items ri USING (
  SELECT producto_id, insumo_id, MIN(id) AS keep_id FROM receta_items
  GROUP BY producto_id, insumo_id HAVING COUNT(*) > 1) t
WHERE ri.producto_id = t.producto_id AND ri.insumo_id = t.insumo_id AND ri.id <> t.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receta_producto_insumo
  ON receta_items(producto_id, insumo_id);
