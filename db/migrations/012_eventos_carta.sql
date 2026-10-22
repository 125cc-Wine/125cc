-- Eventos de uso de la carta nueva (/nueva): qué vinos se abren, cuántas
-- catas rápidas/completas se anotan, en qué paso de la cata se abandona,
-- cuántos dejan el email, el voto del ¿Qué tomo?, etc. Los registra
-- api/stats.js (POST con "evento"). sesion es un id al azar por pestaña,
-- sin datos personales; datos guarda el detalle propio de cada evento.
CREATE TABLE IF NOT EXISTS eventos_carta (
  id         bigserial PRIMARY KEY,
  evento     text NOT NULL,
  vino_id    int,
  sesion     text,
  datos      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_carta_evento_fecha ON eventos_carta (evento, created_at);
