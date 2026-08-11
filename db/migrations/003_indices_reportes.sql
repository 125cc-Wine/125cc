-- Auditoría v2, C2: índices que faltan para las queries de reportes y
-- finanzas. No urgente al volumen actual (~40 comandas/día, unas 15.000
-- comandas y 100.000 líneas al año) pero es el momento barato: se crean
-- en un local con poco volumen y no vuelven a molestar.
CREATE INDEX IF NOT EXISTS idx_comandas_cerradas
  ON comandas(cerrada_at) WHERE estado = 'cerrada';

CREATE INDEX IF NOT EXISTS idx_comanda_items_producto
  ON comanda_items(producto_id) WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_comanda
  ON caja_movimientos(comanda_id) WHERE comanda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cc_movimientos_comanda
  ON cuenta_corriente_movimientos(comanda_id) WHERE comanda_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comanda_items_anulados
  ON comanda_items(anulado_at) WHERE estado = 'anulado';
