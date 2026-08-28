# 125cc como sistema POS completo — qué tiene, qué le falta

Análisis pedido el 28/08/2026 ("analisemos como sistema POS de
restaurante/wine bar nos esta faltando"). A diferencia del análisis de
costeo de insumos (`ANALISIS-COSTEO-INSUMOS.md`, ya implementado), este
mira el POS como sistema completo: mesas, comandas, cobro, caja,
clientes, facturación, reportes — todo lo que ya se auditó a fondo en
`handoff/ESTADO-POS.md` y en las últimas sesiones.

**Contexto de escala, otra vez** — un wine bar de una sola sucursal, con
tapeo de comida simple (no una cocina completa), sin reservas ni delivery
hoy. La pregunta no es "¿qué tiene un POS enterprise?", es "¿qué de eso
resuelve un dolor real acá?". Varias cosas de la lista de abajo son
gaps reales de la industria que **no** recomiendo construir a esta
escala — están marcadas como tales.

## Lo que 125cc ya tiene, al nivel de un POS profesional serio

No es poco — vale nombrarlo antes de listar huecos:
- Salón visual con plano arrastrable, mesas por color/tiempo transcurrido.
- Comandas: agregar/restar/anular con trazabilidad de quién y cuándo,
  traslado entre mesas, descuentos.
- Cobro dividido en partes, múltiples medios en la misma cuenta,
  cortesías de la casa, cuenta corriente (fiado) con ledger propio.
- Caja: turno único, arqueo con diferencia esperado vs. contado,
  propinas separadas del efectivo esperado.
- Clientes con datos fiscales, segmentación de frecuentes, cuenta
  corriente opt-in.
- Facturación electrónica AFIP real (WSAA/WSFEv1 implementado a mano,
  no una librería de terceros) — desplegada, en homologación.
- Reportes con comparación de período, gráfico de ventas, top
  productos/margen, food cost % (recién agregado).
- Costeo de insumos con receta, conversión de unidades, mermas/conteo
  con historial (recién agregado, ver el otro análisis).

Esto ya está más completo que varios POS comerciales chicos en varios
de estos puntos — sobre todo en trazabilidad y auditoría.

## Gaps reales, ordenados por qué tanto importan acá

**1. No hay comanda de cocina/barra impresa ni ruteada.** Cuando un
mozo agrega un ítem, nada le avisa a cocina/barra qué preparar — hoy
depende de que alguien mire la pantalla o se lo digan de palabra. Todo
POS de restaurante real tiene esto como básico (impresora de
cocina/KDS que recibe el ticket apenas se confirma el ítem). Para el
tapeo actual (fiambres, pan) puede no doler tanto — pero si el menú de
comida crece, esto se vuelve el primer cuello de botella real.

**2. Sin integración de pago real (terminal/gateway).** "Tarjeta" y
"transferencia" son etiquetas que el mozo tipea a mano después de
cobrar en un posnet aparte — no hay conexión con el procesador de pago
real. Consecuencia: nada concilia automáticamente lo que el POS dice
que entró por tarjeta contra lo que el banco/Mercado Pago liquidó de
verdad. Un mozo que se equivoca de monto o se olvida de cargar un pago
no lo detecta nadie hasta el resumen del banco, días después.

**3. Sin resiliencia offline real.** Ya está identificado (el aviso de
"sin conexión, nada se guarda" que ya existe en la app) pero sigue sin
resolverse: sin wifi, el POS no puede tomar ni un pedido. Un sistema
profesional cachea localmente (localStorage/IndexedDB) y sincroniza al
volver la conexión — acá cualquier corte de wifi para el servicio en
seco durante el corte.

**4. Sin notas/modificadores por ítem de comanda.** `comandas.notas`
existe a nivel de TODA la comanda, pero `comanda_items` no tiene un
campo para "sin aceitunas" o "bien fría" en una línea puntual — solo se
puede anotar algo para la mesa entera, no para un ítem específico.

## Lo que la industria tiene pero acá probablemente NO hace falta

- **Reservas / lista de espera** — 125cc parece operar a demanda, sin
  señal de que reservar sea un dolor hoy.
- **Delivery / pedidos online** — el QR es para ver la carta en la
  mesa, no para pedir a domicilio; no hay indicio de que se necesite.
- **Tarjetas de regalo / puntos de fidelidad formales** — ya existe
  cuenta corriente + segmentación de frecuentes con descuento sugerido,
  que cubre gran parte de lo que resolvería un programa de loyalty acá.
- **Costeo de mano de obra por turno/empleado** — sueldos ya se
  trackean como gasto mensual agregado (categoría "Sueldos" en
  Finanzas); desglosarlo por turno/persona es un nivel de granularidad
  que un local de esta escala normalmente no necesita.
- **Roles/permisos por usuario** — decisión ya tomada a propósito (una
  sola contraseña compartida), documentada en `ESTADO-POS.md`.
- **Multi-sucursal** — no aplica, una sola locación.

Fuentes: [AIO — Restaurant POS Features Checklist](https://aioapp.com/blog/restaurant-pos-features-checklist),
[Quantic — 44 Must-Have Restaurant POS Features 2026](https://getquantic.com/restaurant-pos-system-features/),
[Quantic — Best Bar POS Systems](https://getquantic.com/best-bar-pos-systems/),
[SpotOn — POS Offline Mode](https://www.spoton.com/blog/pos-offline-mode/),
[Silverware — What happens when a POS goes offline](https://www.silverwarepos.com/silverware-knowledge-base/what-happens-when-a-restaurant-pos-system-goes-offline-during-service).

## Recomendación

Ninguno de los 4 gaps reales es urgente hoy (el POS todavía no está en
uso real, ver `ESTADO-POS.md`) pero **#3 (offline)** es el que más me
preocuparía antes de un lanzamiento real — un corte de wifi un viernes
a la noche para el servicio en seco es el peor momento posible para
descubrirlo. #1 y #2 dependen de decisiones del dueño (¿va a haber
cocina de verdad? ¿qué terminal de pago usan?) que no puedo asumir yo.

Este documento es el análisis pedido — no se tocó código. Falta decidir
con el dueño cuál (si alguno) atacar ahora.
