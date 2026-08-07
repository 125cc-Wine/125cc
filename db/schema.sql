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
  pos_x           numeric,                       -- posición en el plano del salón, 0-100 (%)
  pos_y           numeric,                       -- NULL = todavía no ubicada a mano en el plano
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Si la tabla ya existía sin estas columnas (deploy previo a Fase 1.1):
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS pos_x numeric;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS pos_y numeric;

-- ── productos (catálogo de venta del POS — independiente del Sheet de Vinos) ──
CREATE TABLE IF NOT EXISTS productos (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,
  categoria       text NOT NULL DEFAULT 'otros',  -- vino_tinto/blanco/rosado/naranja/otros
  unidad_venta    text NOT NULL DEFAULT 'copa' CHECK (unidad_venta IN ('copa','botella','unidad')),
  precio          numeric(10,2) NOT NULL CHECK (precio >= 0),
  costo           numeric(10,2),                  -- NULL = costo no cargado todavía (sin esto no hay margen real)
  stock_actual    int,                            -- NULL = stock no trackeado
  stock_minimo    int,                            -- umbral de aviso, no bloquea
  activo          boolean NOT NULL DEFAULT true,  -- disponible en el ciclo de carta actual
  vino_ref        text,                           -- referencia libre al id/nombre del Sheet de Vinos, solo display
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
-- Si la tabla ya existía sin esta columna:
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo numeric(10,2);

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
  total           numeric(10,2) NOT NULL DEFAULT 0,  -- snapshot calculado server-side al cerrar (después del descuento)
  descuento_tipo  text CHECK (descuento_tipo IN ('porcentaje','monto')),
  descuento_valor numeric,                           -- NULL = sin descuento
  notas           text,
  abierta_at      timestamptz NOT NULL DEFAULT now(),
  cerrada_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_comandas_estado ON comandas(estado);
CREATE INDEX IF NOT EXISTS idx_comandas_mesa ON comandas(mesa_id);
-- Evita que dos mozos abran dos comandas a la vez en la misma mesa.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_comanda_per_mesa
  ON comandas(mesa_id) WHERE estado = 'abierta' AND mesa_id IS NOT NULL;
-- Si la tabla ya existía sin estas columnas (deploy previo a Fase 4.1):
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS descuento_tipo text CHECK (descuento_tipo IN ('porcentaje','monto'));
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS descuento_valor numeric;

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

-- ── pos_config (config chica de una sola clave/valor, reusable) ──
-- Ej: umbral de alerta de margen bajo, umbral de "cliente frecuente"
-- más adelante — evita crear una tabla de una sola fila por cada
-- parámetro chico que aparezca.
CREATE TABLE IF NOT EXISTS pos_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pos_config (clave, valor) VALUES ('margen_alerta_pct', '30')
  ON CONFLICT (clave) DO NOTHING;

-- ── proveedores ────────────────────────────────────────────────────
-- Deliberadamente chico: quién vende qué y a qué precio. Nada de
-- órdenes de compra ni cuenta corriente — eso sería construir de más
-- sin necesidad confirmada.
CREATE TABLE IF NOT EXISTS proveedores (
  id          serial PRIMARY KEY,
  nombre      text NOT NULL,
  contacto    text,                 -- teléfono/email libre, sin validación
  notas       text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Precio de compra de un producto a un proveedor puntual. producto_id
-- por ahora (no hay insumo_id todavía — eso llega en la fase de
-- recetas, se agrega con un ALTER TABLE cuando exista la tabla insumos).
CREATE TABLE IF NOT EXISTS proveedor_productos (
  id             serial PRIMARY KEY,
  proveedor_id   int NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  producto_id    int NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_compra  numeric(10,2) NOT NULL CHECK (precio_compra >= 0),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedor_producto ON proveedor_productos(proveedor_id, producto_id);

-- ── stock_movimientos (mermas + conteo físico) ────────────────────
-- Ledger único para "un ajuste de stock que no vino de una venta" —
-- justo el hueco que comanda-item.js ya señala (stock_actual solo se
-- mueve por venta). Mermas y conteo son conceptualmente lo mismo, así
-- que comparten tabla en vez de una por separado.
CREATE TABLE IF NOT EXISTS stock_movimientos (
  id             serial PRIMARY KEY,
  producto_id    int NOT NULL REFERENCES productos(id),
  tipo           text NOT NULL CHECK (tipo IN ('merma','ajuste_conteo')),
  cantidad       numeric NOT NULL,   -- negativo = salida (merma, o ajuste hacia abajo)
  motivo         text,               -- 'rotura'|'vencimiento'|'robo'|'otro' para mermas; libre para conteo
  stock_antes    numeric,
  stock_despues  numeric,
  registrado_por text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_producto ON stock_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_fecha ON stock_movimientos(created_at);

-- ── insumos + recetas (solo backend por ahora — no hay menú de comida
-- real todavía, se deja la estructura lista sin construir UI/contenido
-- inventado). Un vino sigue con productos.costo cargado a mano; un
-- futuro producto compuesto (costo_calculado=true) deriva su costo de
-- SUM(receta_items.cantidad * insumos.costo_unitario). ──
CREATE TABLE IF NOT EXISTS insumos (
  id              serial PRIMARY KEY,
  nombre          text NOT NULL,
  unidad          text NOT NULL,       -- 'g'/'ml'/'unidad', texto libre como productos.categoria
  costo_unitario  numeric(10,2),       -- NULL = no cargado todavía
  stock_actual    numeric,             -- NULL = no trackeado, mismo patrón que productos
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receta_items (
  id           serial PRIMARY KEY,
  producto_id  int NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id    int NOT NULL REFERENCES insumos(id),
  cantidad     numeric NOT NULL CHECK (cantidad > 0),  -- cantidad de insumo por unidad vendida del producto
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receta_items_producto ON receta_items(producto_id);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_calculado boolean NOT NULL DEFAULT false;

-- proveedor_productos ahora puede vincular un insumo en vez de un
-- producto (recién existe la tabla insumos) — sin UI todavía, mismo
-- criterio que el resto de esta fase.
ALTER TABLE proveedor_productos ADD COLUMN IF NOT EXISTS insumo_id int REFERENCES insumos(id);
ALTER TABLE proveedor_productos ALTER COLUMN producto_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedor_insumo ON proveedor_productos(proveedor_id, insumo_id) WHERE insumo_id IS NOT NULL;
