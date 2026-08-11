# 125cc POS — estado del proyecto (para revisión/mejora)

Este documento es para dárselo a otra sesión de Claude (Opus 5 u otra) que
no tiene contexto previo, para que audite y proponga mejoras al POS interno
de 125cc Wine Bar. Repo: `125cc-Wine/125cc` (GitHub), deploy en Vercel,
producción en `https://www.125cc.com.ar`.

## Qué es 125cc y qué es este POS

125cc es un wine bar real (Buenos Aires, Argentina). El repo tiene **dos
productos separados** que comparten deploy:

1. **`public/index.html`** — la carta pública que el cliente ve al escanear
   un QR en la mesa. Es de una sola sesión (el cliente no vuelve a abrirla
   entre visitas), catálogo de vinos que rota completo cada 14 días
   (Google Sheets como fuente). **No es parte de esta revisión** salvo que
   se detecte algo que lo afecte indirectamente.
2. **`public/pos.html`** — el sistema de punto de venta interno (mozos,
   caja, cocina/barra), uso diario del personal en un local real, un solo
   archivo HTML+CSS+JS de ~3600 líneas. **Este es el foco de la revisión.**

El POS está en uso real (no es una maqueta) — el local ya lo usa para
mesas, comandas, cobro y caja del día a día.

## Arquitectura técnica

- **Frontend**: un solo archivo `public/pos.html`, sin build step, sin
  framework — HTML+CSS+JS vanilla en un `<script>` inline. Sin librerías
  externas (ni siquiera para gráficos: los charts de Reportes/Finanzas son
  Canvas 2D nativo, dibujados a mano).
- **Backend**: Vercel Functions (Node serverless), Postgres vía Neon
  (`@neondatabase/serverless`, sin ORM, SQL con template tags). Vercel
  **Hobby plan = máximo 12 funciones serverless por deploy**. El POS entero
  (~55 operaciones) vive detrás de **un solo router**, `api/pos.js`, que
  despacha por querystring `?r=<recurso>` a módulos bajo `api/_lib/pos/*.js`
  (esa carpeta no cuenta para el límite de 12 porque no está directo bajo
  `/api`). El resto de `/api` son endpoints viejos de la carta pública
  (Sheets), no tocarlos sin necesidad.
- **Schema**: `db/schema.sql` es la única fuente de verdad, se aplica a
  mano/con `node db/migrate.js` (hay un runner de migraciones versionado en
  `db/migrations/` desde hace poco, `db/migrations/README.md` documenta el
  flujo — antes todo era ad-hoc).
- **Auth**: una sola contraseña compartida de local (`POS_PASSWORD` en env),
  sin roles ni usuarios individuales — cualquier mozo/encargado entra con
  la misma clave. `atendido_por`/`registrado_por` son campos de texto libre
  que cada uno tipea, no una sesión de usuario real.

### Trampa de bundling ya pisada (importante si se toca `api/pos.js`)

El bundler de Vercel (`@vercel/nft`) arma el paquete de cada función
rastreando `require(...)` **de forma estática** (análisis de texto, no
ejecución). Un `require(variable)` no es rastreable: los módulos de
`_lib/pos/*` quedan afuera del deploy y cualquier ruta tira 500 "Error
interno" en producción aunque local funcione perfecto. La forma correcta
(la que está en uso) es un closure con el string LITERAL adentro:
`() => require('./_lib/pos/mesas').listMesas`. Esto ya causó una caída de
producción real en este proyecto — cualquier cambio a `ROUTES` en
`api/pos.js` tiene que preservar ese patrón.

## Estado funcional — qué existe hoy

Todo lo siguiente está construido, desplegado y en uso (no es roadmap):

- **Salón/Mesas**: plano visual arrastrable, delimitado a la pantalla sin
  scroll, pines con color por estado (libre/ocupada/cuenta_pedida) y
  minutos transcurridos en el pin (con aviso visual pasados 8 min con
  cuenta pedida). Alta/baja lógica de mesas, auto-refresco cada 10s.
- **Comandas**: abrir por mesa (o suelta/takeaway), agregar/restar/anular
  ítems (anulación deja rastro de quién y cuándo), trasladar de mesa,
  aplicar descuento (%, o monto fijo).
- **Cobro**: abrir caja inline si no había una abierta, dividir el pago en
  partes, múltiples medios de pago en la misma comanda (incluye
  `cuenta_corriente` — fiado a clientes habilitados explícitamente).
- **Caja**: sesión de turno único (abrir/cerrar), movimientos (venta,
  retiro, ingreso, propina, cobro de cuenta corriente), arqueo con
  diferencia esperado vs. contado.
- **Stock**: por producto, con soporte específico para vino **por botella
  vendido por copa** — `productos.copas_por_botella`, el stock se descuenta
  en fracción de botella por copa servida (no unidades enteras). Registro
  de mermas y conteo físico, alertas de stock bajo, franja de resumen
  (valorizado, bajo mínimo, mermas del mes).
- **Menú** (recién agregado): platos (= cualquier producto sin
  referencia a un vino del Sheet) con receta de insumos y costeo
  calculado automáticamente (`costo = Σ cantidad × costo_unitario` de cada
  insumo de la receta). Insumos son materia prima reutilizable entre
  varias recetas. Solo interno — no toca la carta pública QR.
- **Proveedores**: quién vende qué y a qué precio, con un botón para
  aplicar el precio de compra como costo del producto (con aviso si el
  margen queda bajo).
- **Finanzas**: gastos (fijos/variables), costos fijos versionados
  (historial de presupuesto, no se pisa al subir un monto), estado de
  resultados mensual (ingresos − costo variable − gastos) con comparación
  presupuestado vs. real y serie de 6 meses en gráfico.
- **Clientes**: alta/búsqueda, datos fiscales (CUIT/razón social/condición
  IVA) para poder facturar, cuenta corriente opt-in por cliente (ledger de
  cargos/pagos), segmentación de clientes frecuentes con export CSV.
- **Facturación electrónica (AFIP, WSFEv1)**: integración completa
  (WSAA para autenticación + WSFEv1 para autorizar comprobantes), Factura A
  automática si el cliente es Responsable Inscripto con CUIT, si no Factura
  B. **Desplegada pero inactiva** — está en ambiente de homologación,
  esperando que el dueño cargue el certificado real de producción.
- **Reportes**: grilla de tarjetas (no todo apilado en una columna), total
  del período con comparación vs. período anterior, gráfico de ventas
  diarias, top productos, top por margen, ventas por medio de pago real
  (no colapsa pagos mixtos en un bucket opaco), anulaciones con quién las
  hizo.

### Diseño / UX

Rediseño completo hecho hace poco: los 7-8 paneles de back-office (antes
modales chicos centrados de 480px) pasaron a **pantalla completa** (tipo
Fudo/POS profesional), con set propio de ~25 íconos de línea dibujados a
mano (sin CDN, estilo Lucide/Feather), animaciones sutiles, más
radio/aire/sombra. Sigue el criterio de "sin dependencias externas" de
todo el proyecto.

## Deliberadamente afuera de alcance (no proponer sin preguntar)

- **AFIP en producción real**: bloqueado por el dueño, no por falta de
  código — el certificado real nunca se pega en el chat, se carga con
  `vercel env add` desde un archivo local cuando el dueño decida activarlo.
- **Roles/permisos por usuario**: hoy es una sola contraseña compartida a
  propósito, no se pidió multiusuario.
- **Multi-turno de caja simultáneo**: hoy es un turno único a la vez.
- **Notas de crédito AFIP**: no implementadas.
- **Editor visual de salón/mesas más allá del plano actual**: ya se sacó
  una vez del alcance por no tener uso real.
- **Menú de comida público (carta QR)**: el "Menú" nuevo del POS es
  deliberadamente interno, no se conecta a `index.html`.

## Qué se busca de esta revisión

Ya hubo una auditoría externa anterior (8 hallazgos, todos corregidos:
condiciones de carrera en comanda_items, margen que ignoraba descuentos,
trazabilidad de anulaciones, migraciones versionadas, franjas de resumen
por panel, entre otros). Para esta vuelta se busca una mirada fresca sobre:

- Bugs o inconsistencias de lógica de negocio no detectados todavía.
- Deuda técnica real (no cosmética) en `api/_lib/pos/*.js` o en el bloque
  `<script>` de `pos.html`.
- Huecos de seguridad (más allá de "no hay roles", que es una decisión
  tomada) — inyección, validación de input, IDOR entre recursos.
- UX del día a día real de un mozo bajo presión (no estética — ya se hizo
  una pasada de diseño): pasos de más, confirmaciones que faltan o sobran,
  información que no se ve cuando se necesita.
- Performance con el volumen real de un local (no a escala, pero sí varios
  turnos por semana con historial creciendo).

Cualquier hallazgo debería venir con la ubicación exacta (archivo + función
o sección de `pos.html`) para poder verificarlo contra el código antes de
actuar — así se trabajó la auditoría anterior y funcionó bien.
