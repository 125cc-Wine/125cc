-- Comanda de cocina/barra (handoff/ANALISIS-POS-SISTEMA-COMPLETO.md,
-- hallazgo 1): antes nada le avisaba a cocina qué preparar cuando un
-- mozo agregaba un ítem — dependía de mirar la pantalla o decírselo de
-- palabra. estado_cocina vive en comanda_items (no una tabla aparte):
-- es un estado del ítem mismo, mismo criterio que estado='activo'/
-- 'anulado' ya usado ahí. NULL = no aplica (vino — se sirve en el
-- momento, no necesita cola de preparación); 'pendiente'/'listo' para
-- ítems de comida (productos sin vino_ref). comanda-item.js decide cuál
-- corresponde al crear la línea.
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS estado_cocina text
  CHECK (estado_cocina IN ('pendiente', 'listo'));
CREATE INDEX IF NOT EXISTS idx_comanda_items_cocina ON comanda_items(estado_cocina) WHERE estado_cocina = 'pendiente';
