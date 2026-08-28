-- Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md) — Tier 2 y base
-- de Tier 3.

-- Hallazgos 2 y 3: unidad de insumo pasa de texto libre (causó un dato
-- mal cargado real: "Mondiolita" con unidad="25") a una lista fija, y se
-- agrega el mismo patrón de conversión compra↔receta que ya existía para
-- vinos (productos.copas_por_botella) pero nunca se replicó acá —
-- costo_unitario sigue siendo SIEMPRE por unidad de COMPRA (litro,
-- kilo...) — factor_receta dice cuántas unidades de RECETA (ml, gramos...)
-- hay en 1 unidad de compra, default 1 = misma unidad para comprar y para
-- cocinar, sin conversión.
UPDATE insumos SET unidad = 'unidad' WHERE unidad NOT IN ('g','kg','ml','l','unidad','paquete');
ALTER TABLE insumos DROP CONSTRAINT IF EXISTS insumos_unidad_check;
ALTER TABLE insumos ADD CONSTRAINT insumos_unidad_check CHECK (unidad IN ('g','kg','ml','l','unidad','paquete'));
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS factor_receta numeric NOT NULL DEFAULT 1 CHECK (factor_receta > 0);

-- Hallazgo 4: stock_movimientos (mermas, conteo físico, con quién/cuándo)
-- hasta acá solo servía productos — un insumo vencido/roto/mal contado no
-- tenía dónde registrarse, la única corrección posible era pisar
-- insumos.stock_actual a mano sin dejar rastro. producto_id pasa a
-- nullable y se agrega insumo_id — exactamente uno de los dos cargado por
-- fila (num_nonnulls, mismo criterio que ya usa proveedor_productos con
-- producto_id/insumo_id, aunque ahí se resolvió con un índice único
-- parcial en vez de un CHECK porque el caso ahí es unicidad, no
-- pertenencia exclusiva).
ALTER TABLE stock_movimientos ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE stock_movimientos ADD COLUMN IF NOT EXISTS insumo_id int REFERENCES insumos(id);
ALTER TABLE stock_movimientos DROP CONSTRAINT IF EXISTS stock_movimientos_uno_de_los_dos;
ALTER TABLE stock_movimientos ADD CONSTRAINT stock_movimientos_uno_de_los_dos
  CHECK (num_nonnulls(producto_id, insumo_id) = 1);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_insumo ON stock_movimientos(insumo_id);

-- Hallazgo 6: food cost % agregado — mismo patrón que margen_alerta_pct
-- (productos-alertas.js), un umbral configurable en pos_config en vez de
-- una tabla de una fila. 32% como default de arranque (banda sana típica
-- 28-32%, ver fuentes del análisis).
INSERT INTO pos_config (clave, valor) VALUES ('food_cost_alerta_pct', '32')
  ON CONFLICT (clave) DO NOTHING;
