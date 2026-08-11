-- Calendario de Carta (stats.html, pestaña "Calendario de Carta"): registro
-- de qué vino estuvo en carta cada semana, para poder bloquearlo en los
-- pools de selección durante la temporada de no-repetición (12 meses desde
-- la última vez que se confirmó). vino_id/nombre/bodega quedan como
-- snapshot de texto — el catálogo real vive en el Sheet (fuera de
-- Postgres), así que no hay FK: si un vino se borra o se renombra del
-- Sheet, el historial no se pierde ni se corrompe.
CREATE TABLE IF NOT EXISTS carta_historial (
  id                       serial PRIMARY KEY,
  vino_id                  int NOT NULL,
  vino_nombre              text NOT NULL,
  bodega                   text NOT NULL,
  semana_label             text NOT NULL,   -- 'Semana 1' / 'Semana 2' de la sesión de planificación que la confirmó
  semana_inicio            date NOT NULL,   -- fecha (lunes) de arranque de esa semana de carta
  confirmado_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carta_historial_vino ON carta_historial(vino_id);
CREATE INDEX IF NOT EXISTS idx_carta_historial_confirmado ON carta_historial(confirmado_at);
