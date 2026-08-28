# Costeo de insumos — cómo lo hace un restaurante profesional vs. cómo lo hace 125cc hoy

Análisis pedido el 28/08/2026 ("hacer un analisis de esta parte de insumos y
hacerla profesional como un restaurant tomaria los costos"). Alcance: el
módulo Menú → Insumos/Platos/Receta del POS (`api/_lib/pos/insumos.js`,
`receta.js`, `productos.js`, `stock-movimiento.js`, `proveedor-producto.js`,
tablas `insumos`/`receta_items`/`stock_movimientos`/`proveedor_productos`
de `db/schema.sql`, y la UI correspondiente en `public/pos.html`).

**Contexto de escala** — esto no es un restaurante grande: hoy hay 1 insumo
real cargado ("Mondiolita") y 2 platos reales ("Fiambres", "Pan y Teca"; el
resto de `productos` sin `vino_ref` son filas de prueba). El menú de comida
es chico y probablemente se queda chico (tapeo para acompañar el vino, no
una cocina completa). Esto importa para la recomendación final — varios
conceptos "profesionales" de la industria son overkill a esta escala y no
deberían construirse sin dolor confirmado (mismo criterio que ya se aplicó
achicando el stock de vinos, ver `[[feedback_ct_no_inventory]]` en memoria).

## Cómo lo hace la industria (resumen de research, fuentes al final)

Los sistemas de costeo de recetas profesionales (meez, WISK, MarketMan,
Toast, etc.) se apoyan en un puñado de ideas consistentes:

1. **Unidad de compra ≠ unidad de receta.** Se compra aceite en litros, la
   receta pide 15ml. El sistema convierte automáticamente — nunca se espera
   que quien carga el costo lo "pre-convierta" a mano.
2. **La venta descuenta el insumo, no solo el producto.** Vender un plato
   con receta resta de cada insumo la cantidad que la receta dice que
   usa — así el stock de insumos refleja consumo real, no solo lo que
   alguien recordó restar a mano.
3. **Costo real vs. costo teórico (variance).** Teórico = lo que la receta
   dice que debería haber costado según lo vendido. Real = lo que
   efectivamente se contó/compró. La diferencia (variance) es la señal de
   merma, porcionado de más, o robo — variance bajo (1-3%) es sano, alto
   es una alarma.
4. **Yield / merma de preparación.** Un insumo comprado entero rinde menos
   una vez limpio (ej. jamón con hueso). El % de rendimiento ajusta el
   costo real utilizable.
5. **Sub-recetas.** Una preparación base (salsa, mezcla) usada en varios
   platos se modela como receta propia con costo derivado, no se repite
   insumo por insumo en cada plato que la usa.
6. **Costo por porción Y por lote**, ambos visibles — no solo uno.
7. **Precio de proveedor aplicado con un clic**, no retipeado a mano cada
   vez que cambia.

Fuentes: [Paytronix — Recipe Cost Software](https://www.paytronix.com/blog/recipe-cost-software),
[meez — Menu Engineering & Food Costing Guide](https://www.getmeez.com/blog/menu-engineering-food-costing-software),
[Restaurant365 — Actual vs. Theoretical Food Cost](https://www.restaurant365.com/blog/closing-the-gap-between-actual-and-theoretical-food-costs/),
[VantaInsights — Food Cost Percentage Benchmarks](https://vantainsights.com/insights/restaurant-food-cost-percentage),
[Restroworks — Recipe Costing Example](https://www.restroworks.com/blog/recipe-costing-example/),
[Recipe Cost Calculator — Bad unit conversions poison your costs silently](https://recipecostcalculator.net/features/measurement-converters-weight-to-volume-conversion).

## Qué tiene 125cc hoy (auditado contra el código, no supuesto)

Ya construido y funcionando bien:
- Insumos con costo por unidad, editable (recién agregado).
- Recetas (`receta_items`): insumo + cantidad por plato, con `ON CONFLICT`
  para no duplicar un insumo en la misma receta (auditoría v2, C1).
- Costo del plato calculado automáticamente desde la receta
  (`recalcularCostoReceta`), con `costo_calculado=true` para distinguirlo
  de un costo cargado a mano — y aviso visual cuando el costo cargado
  quedó desactualizado contra la receta actual.
- Costo del plato **congelado** al momento de la venta
  (`comanda_items.costo_snapshot`) — no se reescribe el margen de ventas
  pasadas si el costo de un insumo cambia después. Esto ya está al nivel
  de lo que hace un sistema profesional.
- Aplicar precio de proveedor a un **producto** (vino) con un clic
  (`proveedor-producto.js`, `aplicarCosto`), con conversión botella→copa.

## Brechas encontradas, de mayor a menor impacto

**1. Vender un plato con receta no descuenta el stock de sus insumos —
el hallazgo más grande.** `comanda-item.js` (agregar ítem a una comanda)
solo toca `productos.stock_actual`; nunca lee `receta_items` ni toca
`insumos.stock_actual`. Vender 10 "Fiambres" no resta nada de Mondiolita.
Esto rompe el concepto central de un costeo profesional (punto 2 y 3 de
arriba): sin este vínculo, `insumos.stock_actual` es un número decorativo
que solo se mueve si alguien lo edita a mano, y nunca se puede comparar
"lo que debería haberse consumido según lo vendido" contra "lo que
realmente queda" — la comparación que detecta merma/porcionado de
más/robo.

**2. Sin conversión compra↔receta para insumos — el mismo bug que ya se
resolvió para vinos, sin resolver acá.** `productos.copas_por_botella`
existe justamente para este problema (comprás botella, vendés copa) y
está bien resuelto. `insumos` no tiene ningún campo equivalente: si se
compra aceite de oliva en litros pero la receta lo carga en ml, hoy hay
que pre-convertir el costo a mano al cargarlo — silencioso, sin ningún
aviso si alguien se olvida.

**3. `insumos.unidad` es texto libre sin validar — ya causó un dato mal
cargado real.** "Mondiolita" (el único insumo real cargado hoy) tiene
`unidad = "25"` — alguien tipeó una cantidad donde iba una unidad. A
diferencia de `productos.unidad_venta` (`CHECK IN ('copa','botella',
'unidad')`), acá no hay ninguna lista fija ni validación.

**4. Sin trazabilidad de mermas/conteo para insumos.** `stock_movimientos`
(mermas, conteo físico, con "quién y cuándo") solo referencia
`productos.id`. Un insumo vencido, roto, o mal contado no tiene dónde
registrarse — la única forma de corregir su stock es pisar el número a
mano (recién editable), perdiendo el historial y la trazabilidad que sí
tienen productos y comanda_items.

**5. Sin vínculo proveedor↔insumo en la UI, aunque el backend ya lo
soporta.** El schema (`proveedor_productos.insumo_id`, con su índice
único) y hasta parte del comentario en el código ya anticipan esto — pero
el panel Proveedores del POS y `proveedor-producto.js`'s `aplicarCosto`
solo trabajan con `producto_id`. Hoy no hay forma de decir "este proveedor
vende Mondiolita a $X" ni de aplicar ese precio con un clic — todo costo
de insumo se tipea a mano.

**6. Sin food cost % agregado ni alertas a nivel Menú.** Existe el
equivalente para vinos (`productos-alertas.js`, margen bajo con umbral
configurable) pero nada análogo para el costo de comida en conjunto — solo
el margen individual de cada plato, visto uno por uno.

## Lo que la industria hace pero NO recomiendo construir todavía

- **Yield / merma de preparación (trim loss)** — con 2 platos reales, el
  ajuste de rendimiento por porcionado es precisión que no se nota.
- **Sub-recetas** (preparación base reusada en varios platos) — recién
  tendría sentido si el menú de comida crece más allá de tapeo simple.
- **Costo teórico vs. real (variance)** — depende de resolver primero el
  punto 1 (que la venta descuente insumos); sin eso no hay "teórico" que
  comparar contra nada.
- **Historial versionado de `costo_unitario`** (como `costos_fijos` con
  `vigente_desde`) — útil cuando haya varios insumos con costos que
  cambian seguido; hoy es un insumo.

Construir cualquiera de estas ahora sería repetir el error ya vivido con
el stock completo de vinos: feature construida sin dolor real confirmado,
que después hubo que revertir.

## Recomendación priorizada

**Tier 1 — resuelve el hallazgo más grande, bajo esfuerzo:**
- Conectar venta de plato → descuento de stock de sus insumos (punto 1).
  Es el cambio de mayor impacto real: sin esto, todo lo demás (mermas,
  conteo, alertas) queda calculando sobre un stock que no refleja ventas.

**Tier 2 — cierra huecos ya identificados, esfuerzo bajo/medio:**
- Unidad de insumo con lista fija en vez de texto libre (punto 3).
- Conversión compra↔receta para insumos, mismo patrón que
  `copas_por_botella` (punto 2).
- Vínculo proveedor↔insumo + "aplicar costo" en la UI (punto 5).

**Tier 3 — solo si el menú de comida crece de verdad:**
- Mermas/conteo de insumos con historial (punto 4).
- Food cost % agregado / alertas (punto 6).
- Yield, sub-recetas, variance teórico vs. real.

## Estado — implementado 28/08/2026 (Tier 1+2+3 completo)

Todo lo de arriba está construido, desplegado y probado end-to-end
contra producción (no solo en local):

- **Tier 1**: `stock-unidades.js` (`ajustarStockInsumosPorReceta`) +
  `comanda-item.js` — vender/restar/anular un plato con receta ahora
  descuenta/restituye el stock de sus insumos en la misma transacción.
- **Tier 2**: migración `009_costeo_insumos.sql` — `insumos.unidad` con
  lista fija (`g/kg/ml/l/unidad/paquete`), `insumos.factor_receta` para
  la conversión compra↔receta (`receta.js` ya lo aplica en
  `getReceta`/`recalcularCostoReceta`). `proveedor-producto.js` +
  panel Proveedores ahora vinculan también insumos, con "aplicar costo"
  1:1 (sin dividir — `costo_unitario` ya es por unidad de compra).
- **Tier 3**: `stock_movimientos` acepta `insumo_id` además de
  `producto_id` (mermas/conteo con historial, botones en el panel
  Insumos) + `getResumenInsumos` (franja de cifras). `food-cost.js`
  nuevo (`food-cost:GET`) — food cost % agregado del período con
  alerta configurable (`pos_config.food_cost_alerta_pct`, default 32%),
  mostrado en el panel Reportes.

De paso, la migración 009 destapó un bug real en `db/migrate.js`: el
separador de sentencias por `;` no entendía comentarios SQL, así que un
`;` dentro de un comentario cortaba el archivo a la mitad — corregido
(saca líneas de comentario antes de separar).
