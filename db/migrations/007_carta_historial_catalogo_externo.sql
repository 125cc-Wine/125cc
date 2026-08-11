-- El Calendario de Carta ahora también puede elegir vinos del catálogo
-- externo de Aroma de Vid / La Vid Consultora (repo gestion-vinoteca2,
-- Supabase), cuyos ids son UUID (texto) — a diferencia de los enteros que
-- usa el Sheet de vinos de 125cc. Se relaja vino_id a texto para poder
-- guardar cualquiera de los dos sin perder el historial ya cargado
-- (los enteros existentes se castean a su representación en texto).
ALTER TABLE carta_historial ALTER COLUMN vino_id TYPE text USING vino_id::text;

-- Distingue de qué catálogo vino cada fila ('125cc' o 'catalogo_externo').
-- No hace falta para el bloqueo en sí (los dos espacios de id no pueden
-- chocar en la práctica), pero deja rastro claro para debug/reportes.
ALTER TABLE carta_historial ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT '125cc';
