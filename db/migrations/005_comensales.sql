-- Flujo de "Abrir mesa": antes clickear una mesa libre creaba la comanda
-- directo, sin ningún paso previo. Se agrega comensales (opcional, sin
-- CHECK — 0 comensales no tiene sentido pero se valida en la API, no
-- acá) para completar en el momento de abrir, junto con el cliente
-- (que ya tenía su propio endpoint listo, comanda-cliente.js, pensado
-- justo para este flujo pero sin UI todavía).
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS comensales int;
