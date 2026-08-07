-- ============================================================
-- 125cc POS — schema Postgres
-- Aplicar a mano (psql / SQL editor de Vercel-Neon). No hay
-- framework de migraciones: este archivo es la fuente de verdad,
-- se edita y se reaplica manualmente a medida que el schema crece.
-- ============================================================

-- ── mesas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesas (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,                 -- "Mesa 1", "Barra 3"
  capacidad       int,
  estado          text NOT NULL DEFAULT 'libre'
                    CHECK (estado IN ('libre','ocupada','cuenta_pedida')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── productos (catálogo de venta del POS — independiente del Sheet de Vinos) ──
CREATE TABLE IF NOT EXISTS productos (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,
  categoria       text NOT NULL DEFAULT 'otros',  -- vino_tinto/blanco/rosado/naranja/otros
  unidad_venta    text NOT NULL DEFAULT 'copa' CHECK (unidad_venta IN ('copa','botella','unidad')),
  precio          numeric(10,2) NOT NULL CHECK (precio >= 0),
  stock_actual    int,                            -- NULL = stock no trackeado
  stock_minimo    int,                            -- umbral de aviso, no bloquea
  activo          boolean NOT NULL DEFAULT true,  -- disponible en el ciclo de carta actual
  vino_ref        text,                           -- referencia libre al id/nombre del Sheet de Vinos, solo display
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);

-- Nota de diseño: un vino vendido "por copa" y "por botella" son dos filas
-- separadas (stock_actual y precio propios), no una fila + factor de
-- conversión. Evita bugs de redondeo/fracciones y deja el descuento de
-- stock como un simple `stock_actual -= cantidad`.

-- ── comandas (pedidos) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comandas (
  id              serial PRIMARY KEY,
  mesa_id         int REFERENCES mesas(id),       -- NULL = takeaway / barra suelta
  estado          text NOT NULL DEFAULT 'abierta'
                    CHECK (estado IN ('abierta','cerrada','anulada')),
  atendido_por    text,                            -- nombre libre, sin tabla de usuarios
  medio_pago      text CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','mixto')),
  total           numeric(10,2) NOT NULL DEFAULT 0,  -- snapshot calculado server-side al cerrar
  notas           text,
  abierta_at      timestamptz NOT NULL DEFAULT now(),
  cerrada_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_comandas_estado ON comandas(estado);
CREATE INDEX IF NOT EXISTS idx_comandas_mesa ON comandas(mesa_id);
-- Evita que dos mozos abran dos comandas a la vez en la misma mesa.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_comanda_per_mesa
  ON comandas(mesa_id) WHERE estado = 'abierta' AND mesa_id IS NOT NULL;

-- ── comanda_items (líneas de pedido) ──────────────────────────────
CREATE TABLE IF NOT EXISTS comanda_items (
  id              serial PRIMARY KEY,
  comanda_id      int NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  producto_id     int NOT NULL REFERENCES productos(id),
  nombre_snapshot text NOT NULL,     -- nombre del producto al momento de la venta
  precio_unitario numeric(10,2) NOT NULL,  -- precio al momento de la venta
  cantidad        int NOT NULL CHECK (cantidad > 0),
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','anulado')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comanda_items_comanda ON comanda_items(comanda_id);

-- ── caja_sesiones (turnos de caja) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id                    serial PRIMARY KEY,
  estado                text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  monto_inicial         numeric(10,2) NOT NULL DEFAULT 0,
  monto_final_contado   numeric(10,2),
  monto_final_esperado  numeric(10,2),
  diferencia            numeric(10,2),
  abierta_por           text,
  cerrada_por           text,
  notas                 text,
  abierta_at            timestamptz NOT NULL DEFAULT now(),
  cerrada_at            timestamptz
);
-- Solo un turno abierto a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_caja_sesion
  ON caja_sesiones((estado)) WHERE estado = 'abierta';

-- ── caja_movimientos (cada evento de caja dentro de un turno) ─────
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id              serial PRIMARY KEY,
  caja_sesion_id  int NOT NULL REFERENCES caja_sesiones(id),
  tipo            text NOT NULL CHECK (tipo IN ('venta','retiro','ingreso','propina')),
  comanda_id      int REFERENCES comandas(id),   -- solo cuando tipo='venta'
  medio_pago      text NOT NULL CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','otro')),
  monto           numeric(10,2) NOT NULL,
  descripcion     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sesion ON caja_movimientos(caja_sesion_id);
