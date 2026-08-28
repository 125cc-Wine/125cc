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

-- ── Fase 5: finanzas. costos_fijos es un presupuesto versionado (sube
-- el alquiler → se agrega una fila nueva con vigente_desde, no se pierde
-- el histórico). gastos es lo que realmente se gastó, con un campo tipo
-- en vez de tablas separadas para fijo/variable — la diferencia es solo
-- una etiqueta de reporte una vez que el gasto ya es un registro real. ──
CREATE TABLE IF NOT EXISTS costos_fijos (
  id              serial PRIMARY KEY,
  categoria       text NOT NULL,
  monto_mensual   numeric(10,2) NOT NULL,
  vigente_desde   date NOT NULL DEFAULT CURRENT_DATE,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costos_fijos_categoria ON costos_fijos(categoria, vigente_desde);

CREATE TABLE IF NOT EXISTS gastos (
  id             serial PRIMARY KEY,
  categoria      text NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('fijo','variable')),
  proveedor_id   int REFERENCES proveedores(id),
  monto          numeric(10,2) NOT NULL,
  descripcion    text,
  fecha          date NOT NULL DEFAULT CURRENT_DATE,
  estado         text NOT NULL DEFAULT 'activo',  -- 'activo'|'eliminado' (baja lógica, no se borra histórico)
  registrado_por text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);

-- ── Fase 6: clientes. Tabla propia en Postgres (no "Mis Catas"/Sheets
-- — esa hoja tiene email opcional sin unicidad y no captura teléfono,
-- el dato más útil acá). El cruce con Mis Catas se hace en vivo por
-- email, best-effort, en cliente.js — nunca se sincroniza a esta tabla. ──
CREATE TABLE IF NOT EXISTS clientes (
  id          serial PRIMARY KEY,
  nombre      text NOT NULL,
  telefono    text,
  email       text,          -- sin unicidad forzada, mismo criterio que Mis Catas
  notas       text,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono) WHERE telefono IS NOT NULL;

ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cliente_id int REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_comandas_cliente ON comandas(cliente_id);

-- ── Stock por botella, venta por copa. El stock físico se cuenta en
-- botellas (750cc); cada copa vendida (125cc, uniforme en todo el
-- catálogo hoy) descuenta 1/copas_por_botella de una botella, no 1
-- unidad entera — antes stock_actual se descontaba -1 por copa, sin
-- relación con el tamaño real de la botella. Columna (no una constante
-- hardcodeada) por si algún vino puntual usara otra medida de copa el
-- día de mañana, aunque hoy es uniforme y no hay UI para editarla.
-- stock_actual/stock_minimo eran `int` — un producto por copa ahora
-- descuenta fracciones de botella (1/6 por copa), así que pasan a
-- numeric(12,6) — precisión fija (no ilimitada, para que Postgres
-- redondee en cada escritura y 1/6 no arrastre basura de punto
-- flotante tipo 8e-17) pero con margen suficiente (6 decimales) para
-- que el redondeo acumulado de cientos de copas servidas no desvíe el
-- umbral de "sin stock" antes de tiempo — con solo 4 decimales el
-- error de redondeo de 1/6 por copa alcanza a bloquear la última copa
-- legítima de una botella tras ~12 ventas. ──
ALTER TABLE productos ADD COLUMN IF NOT EXISTS copas_por_botella numeric NOT NULL DEFAULT 6;
ALTER TABLE productos ALTER COLUMN stock_actual TYPE numeric(12,6);
ALTER TABLE productos ALTER COLUMN stock_minimo TYPE numeric(12,6);

-- ── Fase 7: facturación electrónica AFIP (WSFEv1). ──────────────────
-- afip_tickets: cachea el Ticket de Acceso (WSAA) entre invocaciones
-- serverless — Vercel no mantiene estado en memoria entre cold starts,
-- y AFIP limita cuán seguido se puede pedir un ticket nuevo para el
-- mismo servicio (2-10 min entre pedidos). Se reusa mientras no esté
-- por vencer (margen de seguridad de 10 min, ver afip-wsaa.js).
CREATE TABLE IF NOT EXISTS afip_tickets (
  servicio    text NOT NULL,                              -- 'wsfe'
  ambiente    text NOT NULL CHECK (ambiente IN ('homologacion','produccion')),
  token       text NOT NULL,
  sign        text NOT NULL,
  generado_at timestamptz NOT NULL,
  expira_at   timestamptz NOT NULL,
  PRIMARY KEY (servicio, ambiente)
);

-- afip_contadores: fila de lock para serializar la obtención del
-- próximo número de comprobante por (punto_venta, cbte_tipo) — se
-- lockea con SELECT...FOR UPDATE dentro de la misma transacción que
-- llama a FECompUltimoAutorizado + FECAESolicitar, mismo patrón que
-- comanda-cerrar.js usa para la caja. AFIP mismo sigue siendo la
-- fuente de verdad real (se revalida siempre contra
-- FECompUltimoAutorizado antes de pedir el CAE); esta fila es solo el
-- mecanismo de exclusión mutua local.
CREATE TABLE IF NOT EXISTS afip_contadores (
  punto_venta int NOT NULL,
  cbte_tipo   int NOT NULL,
  ultimo_nro  int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (punto_venta, cbte_tipo)
);

-- comprobantes: un comprobante fiscal por comanda cobrada (a lo sumo
-- uno con estado='aprobado' por comanda, forzado por el índice único
-- parcial de abajo — nunca doble emisión de la misma venta).
-- request_json/response_json guardan el detalle exacto mandado/recibido
-- de AFIP para auditoría (esto emite documentos fiscales reales).
CREATE TABLE IF NOT EXISTS comprobantes (
  id                        serial PRIMARY KEY,
  comanda_id                int NOT NULL REFERENCES comandas(id),
  cliente_id                int REFERENCES clientes(id),
  ambiente                  text NOT NULL CHECK (ambiente IN ('homologacion','produccion')),
  punto_venta               int NOT NULL,
  cbte_tipo                 int NOT NULL,                 -- 1=Factura A, 6=Factura B
  numero                    int,                          -- NULL hasta que AFIP lo autoriza
  doc_tipo                  int NOT NULL,                 -- 80=CUIT, 96=DNI, 99=Consumidor Final
  doc_nro                   text NOT NULL,
  condicion_iva_receptor_id int NOT NULL,                 -- 1=Resp. Inscripto, 5=Consumidor Final
  concepto                  int NOT NULL DEFAULT 1,        -- 1=Productos
  imp_neto                  numeric(10,2) NOT NULL,
  imp_iva                   numeric(10,2) NOT NULL,
  imp_total                 numeric(10,2) NOT NULL,
  alicuota_iva_id           int NOT NULL DEFAULT 5,        -- 5=21%
  cae                       text,
  cae_vencimiento           date,
  estado                    text NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente','aprobado','rechazado','error')),
  observaciones             jsonb,                         -- advertencias de AFIP aun si aprobado
  motivo_error              text,
  request_json              jsonb,
  response_json             jsonb,
  intentos                  int NOT NULL DEFAULT 0,
  creado_por                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comprobantes_comanda ON comprobantes(comanda_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_estado ON comprobantes(estado);
CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha ON comprobantes(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS one_aprobado_por_comanda
  ON comprobantes(comanda_id) WHERE estado = 'aprobado';

-- clientes: datos fiscales para poder emitir Factura A (Responsable
-- Inscripto, con CUIT) — sin esto un cliente siempre factura como
-- Consumidor Final (Factura B).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuit text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS condicion_iva text
  NOT NULL DEFAULT 'consumidor_final'
  CHECK (condicion_iva IN ('responsable_inscripto','monotributista','exento','consumidor_final'));

-- ── Cuenta corriente de clientes ("fiado"). Solo clientes marcados
-- explícitamente como de confianza pueden fiar — nunca por default.
-- El saldo se deriva del ledger (SUM(cargo) - SUM(pago)), igual que
-- stock_movimientos, en vez de una columna cacheada que se puede
-- desalinear. Un 'cargo' es una venta cerrada como cuenta_corriente
-- (no mueve caja, la plata todavía no entró); un 'pago' es cuando el
-- cliente salda parte o toda la deuda (eso sí entra a caja). ──
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuenta_corriente_habilitada boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS cuenta_corriente_movimientos (
  id             serial PRIMARY KEY,
  cliente_id     int NOT NULL REFERENCES clientes(id),
  tipo           text NOT NULL CHECK (tipo IN ('cargo','pago')),
  monto          numeric(10,2) NOT NULL CHECK (monto > 0),
  comanda_id     int REFERENCES comandas(id),                  -- solo en 'cargo'
  medio_pago     text CHECK (medio_pago IN ('efectivo','tarjeta','transferencia')), -- solo en 'pago'
  descripcion    text,
  registrado_por text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_movimientos_cliente ON cuenta_corriente_movimientos(cliente_id);

-- comandas.medio_pago y caja_movimientos.tipo necesitan un valor nuevo
-- cada uno: una comanda puede cerrarse (parcial o totalmente) como
-- cuenta_corriente, y cuando el cliente salda la deuda esa plata entra
-- a caja como 'cobro_cuenta_corriente' — distinto de 'venta' para no
-- contarlo dos veces como ingreso (los reportes de ingresos leen
-- comandas.total, no caja_movimientos; esto es solo para el arqueo).
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_medio_pago_check;
ALTER TABLE comandas ADD CONSTRAINT comandas_medio_pago_check
  CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','mixto','cuenta_corriente'));

ALTER TABLE caja_movimientos DROP CONSTRAINT IF EXISTS caja_movimientos_tipo_check;
ALTER TABLE caja_movimientos ADD CONSTRAINT caja_movimientos_tipo_check
  CHECK (tipo IN ('venta','retiro','ingreso','propina','cobro_cuenta_corriente'));

-- ── Eliminar mesas. Baja lógica (activo=false), nunca DELETE físico —
-- mismo criterio que productos/proveedores: una mesa vieja puede tener
-- años de comandas históricas apuntándole (comandas.mesa_id no tiene
-- ON DELETE CASCADE a propósito, para no perder ventas pasadas), así
-- que "eliminar" la oculta del plano en vez de borrarla. ──
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- ── Trazabilidad de anulaciones (auditoría externa, hallazgo 1.4).
-- Antes comanda_items.estado='anulado' no dejaba rastro de quién ni
-- cuándo — anular ítems es la vía clásica de fuga en un bar. Se
-- capturan anulado_at/anulado_por automáticamente (sin fricción nueva
-- en el botón ✕, que sigue siendo un solo toque); motivo queda
-- disponible pero sin UI para cargarlo todavía — no se pidió, se deja
-- la columna lista igual que se hizo con recetas. ──
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS anulado_at timestamptz;
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS anulado_por text;
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS motivo_anulacion text;

-- ── Minutos en el pin del plano (auditoría, hallazgo 1.3). El pin
-- distingue libre/ocupada/cuenta_pedida por color pero no decía hace
-- cuánto — "una mesa en azul hace doce minutos es el problema más caro
-- del turno". Para 'ocupada' se usa comandas.abierta_at (ya existía).
-- Para 'cuenta_pedida' hace falta un timestamp propio: mesas.updated_at
-- no sirve (se pisa con cualquier drag del plano, sin relación con el
-- estado), y abierta_at mide desde que se abrió la mesa, no desde que
-- se pidió la cuenta — pueden ser momentos muy distintos. ──
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cuenta_pedida_at timestamptz;

-- ── Migraciones versionadas (auditoría, hallazgo 3.5). Hasta acá, todo
-- ALTER se aplicaba a mano contra producción, sin staging y sin
-- registro de qué se aplicó — la operación más riesgosa del proyecto
-- era también la que menos ceremonia tenía. Este archivo (schema.sql)
-- sigue siendo la ÚNICA fuente de verdad del schema completo — no
-- cambia nada de eso. Lo que cambia es CÓMO se aplica un cambio nuevo
-- de acá en más: en vez de un script ad-hoc de una sola vez, un
-- archivo numerado en db/migrations/ + `node db/migrate.js`, que
-- registra cada uno acá para no reaplicarlo. Ver db/migrations/README.md. ──
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          text PRIMARY KEY,   -- nombre del archivo, ej '001_ejemplo.sql'
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Auditoría v2, A3: cortesía de la casa. Una comanda con 100% de
-- descuento cierra en $0 sin ningún pago (no entra plata, no hay
-- movimiento de caja) pero SÍ queda registrada como venta, con su
-- costo — antes el único camino era anularla, que restituye el stock y
-- borra el costo del estado de resultados como si nunca se hubiera
-- servido. Ver db/migrations/001_cortesia_medio_pago.sql. ──
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_medio_pago_check;
ALTER TABLE comandas ADD CONSTRAINT comandas_medio_pago_check
  CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','mixto','cuenta_corriente','cortesia'));

-- ── Auditoría v2, C1: un insumo no puede aparecer dos veces en la
-- receta de un mismo plato (cargarlo dos veces infla el costo
-- calculado sin nada que lo señale). Ver
-- db/migrations/002_receta_items_unico.sql. ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_receta_producto_insumo
  ON receta_items(producto_id, insumo_id);

-- ── Auditoría v2, C2: índices para las queries de reportes/finanzas —
-- ver db/migrations/003_indices_reportes.sql. ──
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

-- ── Auditoría v2, C6: costo congelado al momento de la venta — ver
-- db/migrations/004_costo_snapshot.sql. ──
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS costo_snapshot numeric(12,4);

-- ── Flujo de "Abrir mesa" con comensales — ver
-- db/migrations/005_comensales.sql. ──
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS comensales int;

-- ── Calendario de Carta (stats.html, pestaña "Calendario de Carta"): registro
-- de qué vino estuvo en carta cada semana, para poder bloquearlo en los
-- pools de selección durante la temporada de no-repetición (12 meses desde
-- la última vez que se confirmó). vino_id/nombre/bodega quedan como
-- snapshot de texto — el catálogo real vive en el Sheet (fuera de
-- Postgres), así que no hay FK: si un vino se borra o se renombra del
-- Sheet, el historial no se pierde ni se corrompe. Ver
-- db/migrations/006_carta_historial.sql. ──
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

-- El Calendario de Carta ahora también puede elegir vinos del catálogo
-- externo de Aroma de Vid / La Vid Consultora (repo gestion-vinoteca2,
-- Supabase), cuyos ids son UUID (texto) — a diferencia de los enteros que
-- usa el Sheet de vinos de 125cc. Se relaja vino_id a texto y se suma
-- `fuente` para distinguir de dónde vino cada fila. Ver
-- db/migrations/007_carta_historial_catalogo_externo.sql. ──
ALTER TABLE carta_historial ALTER COLUMN vino_id TYPE text USING vino_id::text;
ALTER TABLE carta_historial ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT '125cc';

-- Pestaña "Pedidos" (stats.html) — cuántas cajas pedirle a cada bodega,
-- consolidando todos los meses futuros en los que aparece. La cantidad se
-- carga a mano por vino/quincena (no hay fórmula automática a partir de
-- copas vendidas — decisión del usuario), nullable porque la mayoría de lo
-- ya confirmado antes de este cambio no tiene valor cargado todavía. Ver
-- db/migrations/008_carta_historial_cajas.sql. ──
ALTER TABLE carta_historial ADD COLUMN IF NOT EXISTS cajas int;

-- ── Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md) — Tier 2 y
-- base de Tier 3. Unidad de insumo pasa de texto libre (causó un dato mal
-- cargado real: "Mondiolita" con unidad="25") a lista fija, y se agrega
-- el mismo patrón de conversión compra↔receta que ya existía para vinos
-- (productos.copas_por_botella) — costo_unitario sigue siendo SIEMPRE por
-- unidad de COMPRA, factor_receta dice cuántas unidades de RECETA hay en
-- 1 unidad de compra, default 1 = sin conversión. stock_movimientos
-- (mermas/conteo) pasa a poder referenciar un insumo además de un
-- producto — exactamente uno de los dos por fila (num_nonnulls). Ver
-- db/migrations/009_costeo_insumos.sql. ──
UPDATE insumos SET unidad = 'unidad' WHERE unidad NOT IN ('g','kg','ml','l','unidad','paquete');
ALTER TABLE insumos DROP CONSTRAINT IF EXISTS insumos_unidad_check;
ALTER TABLE insumos ADD CONSTRAINT insumos_unidad_check CHECK (unidad IN ('g','kg','ml','l','unidad','paquete'));
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS factor_receta numeric NOT NULL DEFAULT 1 CHECK (factor_receta > 0);

ALTER TABLE stock_movimientos ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE stock_movimientos ADD COLUMN IF NOT EXISTS insumo_id int REFERENCES insumos(id);
ALTER TABLE stock_movimientos DROP CONSTRAINT IF EXISTS stock_movimientos_uno_de_los_dos;
ALTER TABLE stock_movimientos ADD CONSTRAINT stock_movimientos_uno_de_los_dos
  CHECK (num_nonnulls(producto_id, insumo_id) = 1);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_insumo ON stock_movimientos(insumo_id);

INSERT INTO pos_config (clave, valor) VALUES ('food_cost_alerta_pct', '32')
  ON CONFLICT (clave) DO NOTHING;
