-- Señal de vuelta al salón (handoff/ANALISIS-POS-SISTEMA-COMPLETO.md,
-- feedback tras el hallazgo 1): marcar un ítem "listo" en cocina no
-- avisaba nada del lado del mozo — la pantalla de cocina era de una
-- sola vía. Se agrega 'entregado' como tercer estado: cocina marca
-- 'listo', el salón ve la señal (pin de mesa + panel de comanda) y
-- confirma 'entregado' al llevarlo a la mesa, recién ahí se apaga la
-- señal. Sin esto, "listo" se quedaría prendido para siempre sin forma
-- de apagarlo una vez servido.
ALTER TABLE comanda_items DROP CONSTRAINT IF EXISTS comanda_items_estado_cocina_check;
ALTER TABLE comanda_items ADD CONSTRAINT comanda_items_estado_cocina_check
  CHECK (estado_cocina IN ('pendiente', 'listo', 'entregado'));
