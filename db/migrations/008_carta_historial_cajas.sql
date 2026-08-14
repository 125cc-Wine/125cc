-- Pestaña "Pedidos" (stats.html) — cuántas cajas pedirle a cada bodega,
-- consolidando todos los meses futuros en los que aparece. La cantidad se
-- carga a mano por vino/quincena (no hay fórmula automática a partir de
-- copas vendidas — decisión del usuario), nullable porque la mayoría de lo
-- ya confirmado antes de este cambio no tiene valor cargado todavía.
ALTER TABLE carta_historial ADD COLUMN IF NOT EXISTS cajas int;
