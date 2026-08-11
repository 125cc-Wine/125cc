# Auditoría POS 125cc — segunda vuelta

Plan de trabajo para Claude Code. Leído contra `125cc-Wine/125cc@main` el 11 de agosto de 2026.
14 hallazgos, cada uno con ubicación exacta y parche propuesto, agrupados en 5 tandas.

---

## Cómo usar este documento

Cada hallazgo tiene un ID (`A1`, `B2`, `C3`…), la ubicación exacta en el repo, el síntoma, la causa
y un parche propuesto. **Los parches son propuestas verificadas contra el código de ese commit, no
diffs aplicables a ciegas** — leé el archivo antes de tocarlo y confirmá que la línea sigue igual.

Reglas del proyecto que hay que respetar al aplicar cualquiera de estos cambios:

- **`api/pos.js` — el patrón de `require()` es sagrado.** Cada entrada de `ROUTES` es un closure con
  un string **literal** adentro: `() => require('./_lib/pos/mesas').listMesas`. El bundler de Vercel
  (`@vercel/nft`) rastrea `require()` de forma estática; un `require(variable)` deja los módulos de
  `_lib/pos` afuera del deploy y **todas** las rutas tiran 500 en producción aunque local funcione.
  Esto ya causó una caída real. No refactorizar ese objeto.
- **Límite de 12 funciones serverless** (plan Hobby de Vercel). No agregar archivos nuevos directo
  bajo `/api`. Todo va como entrada nueva en `ROUTES` + módulo en `api/_lib/pos/`.
- **Migraciones**: hay runner versionado en `db/migrations/` (ver `db/migrations/README.md`).
  Los cambios de schema van como migración, no editando `db/schema.sql` a mano.
- **Sin dependencias externas** en `public/pos.html`: vanilla JS, sin build step, sin CDN. Los
  gráficos son Canvas 2D a mano y los íconos son SVG inline. Mantener el criterio.
- **Zona horaria del local**: `America/Argentina/Buenos_Aires`. **Turno único de noche**: la jornada
  comercial arranca a la tarde y termina de madrugada, con corte a las 06:00.

### Orden de aplicación

| Tanda | Hallazgos | Por qué juntas |
| --- | --- | --- |
| 1 | A2, A1 | Corrompen datos que se acumulan. Cada día que pasa hay más para corregir a mano. |
| 2 | A3, B4, B1 | Bloqueos que el personal está sorteando a mano ahora mismo. |
| 3 | A4, B2, C3 | Todo lo que hace que las cifras que se miran no sean las cifras reales. |
| 4 | B3, C1, C4 | Validaciones y candados. Riesgo bajo, se pueden mandar juntos. |
| 5 | C2, C6, UX-1 | Preventivo. Barato ahora, caro cuando el historial ya creció. |

### Fuera de alcance (decisiones ya tomadas por el dueño — no proponer)

AFIP en producción real · roles/permisos por usuario · multi-turno de caja simultáneo ·
notas de crédito AFIP · editor visual de salón · menú de comida en la carta pública.

### Ya corregido en la primera vuelta (verificado en este commit, no volver a tocar)

- Carrera en `comanda_items`: el chequeo de comanda abierta usa `SELECT … FOR UPDATE` dentro de la
  transacción, en las tres ramas de `comanda-item.js`.
- Margen contra descuentos: `reportes.js` usa `comandas.total` (neto) como ingresos.
- Rastro de anulación de línea suelta: `anulado_at` / `anulado_por` / `motivo_anulacion`.
- `one_open_caja_sesion` y `one_open_comanda_per_mesa` ya existen como índices únicos parciales.

---

# TANDA 1 — Corrupción de datos

## A2 · CRÍTICO · La unidad de `productos.costo` no está definida

**Archivos**: `api/_lib/pos/proveedor-producto.js` (`aplicarCosto`), `api/_lib/pos/reportes.js`,
`api/_lib/pos/estado-resultados.js`, `api/_lib/pos/productos-alertas.js`,
`api/_lib/pos/stock-movimiento.js` (`getResumenStock`)

### Síntoma

El margen y el resultado neto del mes aparecen muy por debajo de lo real. Después de aplicar un
precio de proveedor, **todos** los vinos por copa caen en la lista de alertas de margen negativo.
El valorizado del panel Stock no coincide con ninguna de las dos cosas.

### Causa

`aplicarCosto` copia `proveedor_productos.precio_compra` — el precio de una **botella** — directo a
`productos.costo`. Después:

- `reportes.js` y `estado-resultados.js` calculan el costo variable como `ci.cantidad * p.costo`,
  donde `cantidad` está en **copas** → el costo queda multiplicado por 6.
- `productos-alertas.js` compara `precio` (de una copa) contra `costo` (de una botella) → margen
  negativo en todo el catálogo por copa.
- `getResumenStock` hace `stock_actual * costo` — **botellas** por costo — que solo da bien si el
  costo es por botella, la convención opuesta a la que necesitan los reportes.

Los tres consumidores asumen unidades distintas y nadie lo declara.

### Decisión

Adoptar **costo por unidad de venta** (el costo de una copa si el producto se vende por copa). Es la
convención que ya asumen las dos queries de margen, así que no hay que tocarlas: solo dividir al
aplicar el precio del proveedor, y multiplicar en el valorizado de stock.

Documentar la convención en el comentario de cabecera de `productos.js` y en el de
`proveedor-producto.js`, para que no vuelva a derivar.

### Parche — `proveedor-producto.js` → `aplicarCosto()`

```js
// precio_compra es SIEMPRE por unidad de compra (la botella).
// productos.costo es por unidad de VENTA. Si el producto se vende
// por copa, el costo de la copa es el de la botella / copas_por_botella.
const { rows: ppRows } = await sql`
  SELECT pp.precio_compra, p.unidad_venta, p.copas_por_botella
  FROM proveedor_productos pp JOIN productos p ON p.id = pp.producto_id
  WHERE pp.proveedor_id=${proveedor_id} AND pp.producto_id=${producto_id}`;
if (!ppRows.length) return res.status(404).json({ error: "No hay precio cargado para ese proveedor/producto." });

const { precio_compra, unidad_venta, copas_por_botella } = ppRows[0];
const divisor = unidad_venta === 'copa' ? Number(copas_por_botella || 6) : 1;
const nuevoCosto = Number(precio_compra) / divisor;
```

### Parche — `stock-movimiento.js` → `getResumenStock()`

```sql
-- stock_actual está en unidades de COMPRA (botellas); costo está
-- en unidades de VENTA (copas). Para valorizar hay que volver a botella.
SELECT COALESCE(SUM(
  stock_actual * costo *
  CASE WHEN unidad_venta = 'copa' THEN COALESCE(copas_por_botella, 6) ELSE 1 END
), 0) AS valorizado
FROM productos
WHERE activo = true AND stock_actual IS NOT NULL AND costo IS NOT NULL AND stock_actual > 0
```

### Migración — corregir los costos ya cargados

Correr **solo** si los costos actuales vinieron del botón de proveedores. Revisar con el `SELECT`
antes de ejecutar el `UPDATE`, y confirmar con el dueño mirando 3-4 productos concretos.

```sql
SELECT p.id, p.nombre, p.precio AS precio_copa, p.costo AS costo_hoy,
       p.costo / COALESCE(p.copas_por_botella, 6) AS costo_corregido
FROM productos p
JOIN proveedor_productos pp ON pp.producto_id = p.id AND pp.precio_compra = p.costo
WHERE p.unidad_venta = 'copa' AND p.costo IS NOT NULL;

-- UPDATE productos p SET costo = p.costo / COALESCE(p.copas_por_botella, 6), updated_at = now()
-- FROM proveedor_productos pp
-- WHERE pp.producto_id = p.id AND pp.precio_compra = p.costo
--   AND p.unidad_venta = 'copa' AND p.costo IS NOT NULL;
```

---

## A1 · CRÍTICO · Anular una comanda infla el stock de vino

**Archivo**: `api/_lib/pos/comanda-anular.js` → `anularComanda()`

### Síntoma

Cada mesa abierta por error y anulada con copas cargadas suma stock fantasma. El conteo físico lo
encuentra después como un faltante enorme e inexplicable.

### Causa

El stock se restituye con `stock_actual + it.cantidad`, en unidades enteras. Para un vino vendido por
copa, `cantidad` está en copas y `stock_actual` en botellas: tres copas anuladas devuelven **tres
botellas** en lugar de media. Es el mismo cálculo que `comanda-item.js` resuelve bien con
`consumoStock()`; acá quedó sin aplicar.

### Parche

```js
// arriba del archivo, junto al require de db:
function consumoStock(producto) {
  return producto.unidad_venta === 'copa'
    ? 1 / Number(producto.copas_por_botella || 6)
    : 1;
}

// reemplazar el SELECT de items y el loop de restitución:
const { rows: items } = await client.sql`
  SELECT ci.id, ci.producto_id, ci.cantidad, p.unidad_venta, p.copas_por_botella
  FROM comanda_items ci JOIN productos p ON p.id = ci.producto_id
  WHERE ci.comanda_id=${comanda_id} AND ci.estado='activo'`;
for (const it of items) {
  await client.sql`
    UPDATE productos SET stock_actual = stock_actual + ${it.cantidad * consumoStock(it)}
    WHERE id=${it.producto_id} AND stock_actual IS NOT NULL`;
}
```

> Considerar factorizar `consumoStock` a un módulo compartido (`api/_lib/pos/_stock-unidades.js`)
> importado por `comanda-item.js` y `comanda-anular.js`, para que no haya dos copias que puedan
> divergir. Si se hace, el `require` va con string literal por lo del bundler.

---

# TANDA 2 — Bloqueos del día a día

## A3 · CRÍTICO · La cortesía de la casa no se puede cerrar

**Archivo**: `api/_lib/pos/comanda-cerrar.js` → `cerrarComanda()`

### Síntoma

Una comanda con 100% de descuento no se puede cobrar: devuelve "Monto inválido en un pago". El dueño
confirmó que la cortesía de la casa pasa seguido.

### Causa

Con 100% de descuento `total` queda en 0. Después el validador rechaza cualquier pago con
`monto <= 0`, y el camino de compatibilidad arma un único pago por el total (cero) que muere en esa
misma validación. No hay salida.

Hoy el workaround es anular la comanda, pero eso **restituye el stock**: el vino que se tomó vuelve
al inventario y el costo desaparece del estado de resultados. Una cortesía es un gasto real y tiene
que quedar registrada como venta a cero.

### Parche

```js
// Después de calcular `total`, antes de normalizar los pagos.
// Total 0 (cortesía / 100% de descuento) se cierra sin ningún pago:
// no entra plata, así que no hay movimiento de caja — pero la venta
// SÍ queda registrada, con su costo, y el stock no se restituye.
if (total === 0) {
  const { rows } = await client.sql`
    UPDATE comandas SET estado='cerrada', medio_pago='cortesia', total=0, cerrada_at=now()
    WHERE id=${comanda_id}
    RETURNING id, mesa_id, estado, medio_pago, total, cerrada_at`;
  if (openRows[0].mesa_id) {
    await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${openRows[0].mesa_id}`;
  }
  return rows[0];
}
```

### Además

- Sumar `'cortesia'` al CHECK de `comandas.medio_pago` en `db/schema.sql` si existe (verificar).
- Contemplarlo en el desglose por medio de pago de `reportes.js`: va a aparecer con total 0, que es
  correcto, y de paso informa cuántas cortesías se dieron en el período.
- En `pos.html`, el botón de cobro debería ofrecer "Cortesía" como camino explícito en vez de exigir
  que el mozo aplique un descuento del 100% y después cobre.

---

## B4 · ALTO · "Destrabar la mesa" la deja más trabada

**Archivo**: `api/_lib/pos/mesa-estado.js` → `setMesaEstado()`

### Síntoma

El mozo ve una mesa libre en el plano que se niega a abrirse, sin explicación útil.

### Causa

El override a `libre` solo cambia la fila de `mesas`. Si había una comanda abierta, sigue abierta: la
mesa se ve libre pero al abrir una comanda nueva el índice único `one_open_comanda_per_mesa` la
rechaza. El comentario del archivo dice que el override existe justamente para destrabar mesas.

### Parche

```js
// dentro de la transacción, ANTES del UPDATE de mesas:
// pasar a libre con una comanda abierta dejaría el plano mintiendo
// y la mesa imposible de reabrir (one_open_comanda_per_mesa).
if (estado === 'libre') {
  const { rows: abiertas } = await client.sql`
    SELECT id FROM comandas WHERE mesa_id=${id} AND estado='abierta' FOR UPDATE`;
  if (abiertas.length) {
    throw Object.assign(new Error('comanda_abierta'), {
      code: 'comanda_abierta', comandaId: abiertas[0].id,
    });
  }
}

// en el catch:
if (err.code === 'comanda_abierta') return res.status(409).json({
  error: "La mesa tiene una comanda abierta. Cobrala o anulala para liberarla.",
  comanda_id: err.comandaId,
});
```

En `pos.html`, usar el `comanda_id` de la respuesta para ofrecer abrir esa comanda directo desde el
error, en vez de dejar al mozo buscándola.

---

## B1 · ALTO · Anular la comanda entera no deja rastro de quién fue

**Archivo**: `api/_lib/pos/comanda-anular.js` → `anularComanda()`

### Síntoma

Las líneas anuladas por "anular comanda" aparecen en el panel de anulaciones sin responsable y con la
fecha en que se cargaron, no en la que se anularon.

### Causa

El UPDATE masivo pasa las líneas a `anulado` sin escribir `anulado_at` ni `anulado_por`, y el
endpoint no recibe quién anula. Es el mismo agujero que se cerró para la anulación de una línea
suelta, abierto en el camino que anula todas juntas — el que más importa, porque es el que se usa para
vaciar una mesa completa. Como el panel ordena por `COALESCE(anulado_at, created_at)`, cae al
`created_at`.

### Parche

```js
// leer el responsable del body, igual que comanda-item.js:
const { comanda_id, registrado_por, motivo } = req.body || {};

// y en el UPDATE de las líneas:
await client.sql`
  UPDATE comanda_items
  SET estado='anulado', anulado_at=now(), anulado_por=${registrado_por || null},
      motivo_anulacion=${motivo || 'comanda anulada'}
  WHERE comanda_id=${comanda_id} AND estado='activo'`;
```

En `pos.html`, donde se llama a `comanda-anular`, mandar el staff — el patrón ya está en los otros 14
llamados del archivo:

```js
body: { comanda_id, registrado_por: sessionStorage.getItem(STAFF_KEY) }
```

---

# TANDA 3 — Cifras que no son las cifras reales

## A4 · CRÍTICO · La noche se parte en dos días

**Archivos**: `api/_lib/pos/reportes.js` (`serieDiaria`), `api/_lib/pos/estado-resultados.js`
(`rangoMes` y las queries del mes), `public/pos.html` líneas 1687, 1841, 1890, 2169, 2253

### Síntoma

El gráfico de ventas diarias muestra los viernes flojos y los sábados inflados, todas las semanas.
Las últimas horas del último día del mes entran en el mes siguiente. La fecha por defecto de un gasto
cargado después de las nueve de la noche ya viene con el día siguiente.

### Causa

Dos problemas superpuestos:

1. **Todos los cortes de fecha corren en UTC.** `date_trunc('day', cerrada_at)` agrupa por día UTC y
   Buenos Aires está 3 horas atrás: una comanda cobrada a las 21:30 del viernes cae en el sábado.
   `rangoMes()` compara `cerrada_at` contra `'2026-08-01'`, que Postgres lee como medianoche UTC.
   En el frontend, `new Date().toISOString().slice(0,10)` devuelve el día UTC.
2. **La jornada comercial no es el día calendario.** El local trabaja **turno único de noche**:
   arranca a la tarde y termina de madrugada. Una comanda cobrada a la 1:30 del sábado pertenece a la
   noche del viernes — la noche que se trabajó, se dotó de personal y se va a comparar contra el
   viernes anterior.

### Decisión

Corte de jornada a las **06:00 hora local**: todo lo que se cobra hasta las 5:59 suma a la noche que
empezó el día anterior. Es una resta de intervalo en el `date_trunc`, no una tabla nueva.

La sesión de caja es el otro límite natural (con turno único coincide 1:1 con la noche) pero depende
de que la caja se abra y cierre siempre bien: una noche sin cerrar se fusionaría con la siguiente. El
corte por hora no depende de nada y da el mismo resultado en la práctica. Si más adelante se quiere
agrupar literalmente por turno de caja, es un cambio aparte y más grande.

Postgres no permite inyectar la expresión como parámetro, así que va escrita igual en cada query que
agrupe o acote por jornada. Vale un comentario compartido en la cabecera de ambos archivos.

### Parche — `reportes.js`, serie por noche de trabajo

```sql
-- Turno único de noche: la jornada comercial va de la tarde a la
-- madrugada. AT TIME ZONE lleva el instante a hora local; restar 6h
-- corre el límite del día a las 06:00, así lo cobrado hasta las 5:59
-- queda en la noche que empezó el día anterior.
SELECT date_trunc('day',
         (cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '6 hours'
       )::date AS fecha,
       COALESCE(SUM(total),0) AS total
FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${desde}
GROUP BY 1 ORDER BY 1
```

El frontend completa los días sin ventas recorriendo desde `desde`: ese recorrido tiene que usar la
misma noche local, no `toISOString()`.

### Parche — `estado-resultados.js`, el mes por noches

```sql
-- Mismo criterio de jornada en los límites del mes: la noche del 31
-- que termina a las 3 de la mañana del 1 pertenece al mes que cierra.
WHERE estado='cerrada'
  AND ((cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '6 hours') >= ${inicio}::date
  AND ((cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '6 hours') <  ${finExclusivo}::date

-- y en la serie de 6 meses, el mismo date_trunc corrido:
SELECT date_trunc('month',
         (cerrada_at AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '6 hours'
       )::date AS mes
```

Los gastos **no** llevan este tratamiento: `gastos.fecha` ya es una fecha suelta cargada a mano, no
un instante — comparar `date` contra `date`.

### Parche — `pos.html`, fechas por defecto según la noche en curso

```js
// toISOString() devuelve UTC — después de las 21:00 ya es "mañana".
// Y con turno único de noche, a las 2am el encargado sigue trabajando
// la noche de ayer: la fecha que ofrece el formulario tiene que ser esa,
// con el mismo corte de 06:00 que usan las queries.
function nocheLocal(){
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
function mesLocal(){
  return nocheLocal().slice(0, 7);
}
// let finMes = mesLocal();
// document.getElementById('gastoFecha').value = nocheLocal();
// document.getElementById('costoFijoVigencia').value = nocheLocal();
// a.download = `125cc-clientes-${nocheLocal()}.csv`;
```

---

## B2 · ALTO · El arqueo espera en el cajón las propinas que ya se repartieron

**Archivo**: `api/_lib/pos/caja-cerrar.js` → `cerrarCaja()`

### Síntoma

La diferencia del arqueo sale negativa por el total de propinas de la noche, todas las noches.

### Causa

El cálculo del efectivo esperado suma todo lo que no sea un retiro, propinas incluidas. El dueño
confirmó que **las propinas se reparten antes de cerrar la caja**: esa plata ya no está en el cajón
cuando se cuenta.

Es el peor tipo de descuadre: constante, explicable, y por eso mismo enseña al personal a ignorar la
cifra de diferencia — que es justamente la que tiene que gritar cuando falta plata de verdad.

### Parche

```js
// Las propinas en efectivo se reparten al personal antes del cierre,
// así que NO están en el cajón al contarlo: entran y salen dentro del
// mismo turno. Se siguen registrando (sirven para saber cuánto se
// repartió), pero no cuentan para el efectivo esperado.
const netoEfectivo = movRows.reduce((acc, m) => {
  if (m.tipo === 'propina') return acc;
  return acc + (m.tipo === 'retiro' ? -Number(m.monto) : Number(m.monto));
}, 0);

// devolver también el total de propinas, para mostrarlo aparte en el
// resumen de cierre ("repartido en propinas: $X") en vez de esconderlo:
const propinas = movRows
  .filter((m) => m.tipo === 'propina')
  .reduce((acc, m) => acc + Number(m.monto), 0);
// ... RETURNING ...; return { ...rows[0], propinas };
```

Mostrar `propinas` en el resumen de cierre de caja en `pos.html`, como línea informativa separada del
esperado/contado/diferencia.

---

## C3 · MEDIO · Reportes y caja nunca van a cerrar exacto

**Archivo**: `api/_lib/pos/comanda-cerrar.js` (tolerancia de $1)

### Síntoma

El total de ventas de reportes y el total de movimientos de caja no coinciden, con una diferencia
chica que crece mes a mes y que nadie puede explicar.

### Causa

La tolerancia de $1 para los splits es razonable como validación, pero después los pagos se guardan
tal cual llegaron. Reportes suma `comandas.total`; el arqueo suma `caja_movimientos`. Cada cuenta
dividida puede separar las dos cifras hasta un peso.

### Parche

```js
// después de validar la suma y antes de escribir los movimientos:
// la tolerancia sirve para no rechazar un split de $1001 en dos, pero
// lo que se GUARDA tiene que sumar el total exacto — si no, el arqueo
// y los reportes se separan de a un peso por comanda dividida.
const ajuste = total - sumaPagos;
if (ajuste !== 0) {
  const ultimo = pagos[pagos.length - 1];
  ultimo.monto = Number(ultimo.monto) + ajuste;
}
```

---

# TANDA 4 — Validaciones y candados

## B3 · ALTO · El pago de fiado no se valida contra la deuda ni se lockea

**Archivo**: `api/_lib/pos/cuenta-corriente.js` → `registrarPago()`

### Síntoma

Un saldo de cuenta corriente puede quedar en negativo, como si el local le debiera al cliente. Dos
toques al botón registran el cobro dos veces, y no hay endpoint para borrar un movimiento.

### Causa

Se puede registrar un pago por cualquier monto contra cualquier `cliente_id`, sin verificar que el
cliente exista, que tenga cuenta corriente habilitada, ni que deba esa plata. Y no hay lock, así que
dos requests concurrentes entran las dos. El saldo se deriva del ledger, así que el error no se
corrige solo.

### Parche

```js
// dentro de withTransaction, antes de insertar:
// lockear el cliente serializa dos pagos simultáneos del mismo cliente,
// y el saldo se lee ya con el lock tomado.
const { rows: cliRows } = await client.sql`
  SELECT id, nombre FROM clientes WHERE id=${cliente_id} FOR UPDATE`;
if (!cliRows.length) throw Object.assign(new Error('no_cliente'), { code: 'no_cliente' });

const { rows: saldoRows } = await client.sql`
  SELECT COALESCE(SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END), 0) AS saldo
  FROM cuenta_corriente_movimientos WHERE cliente_id=${cliente_id}`;
const saldo = Number(saldoRows[0].saldo);
if (saldo <= 0) throw Object.assign(new Error('sin_deuda'), { code: 'sin_deuda' });
// tolerancia de $1, igual criterio que el split de pagos
if (montoNum > saldo + 1) {
  throw Object.assign(new Error('excede'), { code: 'excede', saldo });
}

// en el catch:
if (err.code === 'no_cliente') return res.status(404).json({ error: "Cliente no encontrado." });
if (err.code === 'sin_deuda')  return res.status(409).json({ error: "Este cliente no tiene deuda pendiente." });
if (err.code === 'excede')     return res.status(400).json({ error: `El pago supera la deuda ($${err.saldo}).` });
```

---

## C1 · MEDIO · Una receta puede tener el mismo insumo dos veces

**Archivos**: `db/schema.sql` línea 191, `api/_lib/pos/receta.js` → `upsertRecetaItem()`

### Síntoma

El costo calculado de un plato queda inflado sin nada que lo señale.

### Causa

`receta_items` tiene índice por `producto_id` pero no único por `(producto_id, insumo_id)`, y el
insert no tiene `ON CONFLICT` — a diferencia de `proveedor_productos`, que sí lo resolvió así.
Cargar dos veces el mismo insumo crea dos filas y `recalcularCostoReceta` suma las dos.

Aparte: `accion: 'eliminar'` borra por `id` sin verificar que el ítem pertenezca al `producto_id` del
body, como sí hace la rama de update. Con una sola contraseña de local el riesgo real es bajo, pero
es gratis cerrarlo.

### Migración

```sql
-- colapsar duplicados existentes y prevenir nuevos
UPDATE receta_items ri SET cantidad = t.total
FROM (SELECT producto_id, insumo_id, SUM(cantidad) AS total, MIN(id) AS keep_id
      FROM receta_items GROUP BY producto_id, insumo_id HAVING COUNT(*) > 1) t
WHERE ri.id = t.keep_id;

DELETE FROM receta_items ri USING (
  SELECT producto_id, insumo_id, MIN(id) AS keep_id FROM receta_items
  GROUP BY producto_id, insumo_id HAVING COUNT(*) > 1) t
WHERE ri.producto_id = t.producto_id AND ri.insumo_id = t.insumo_id AND ri.id <> t.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receta_producto_insumo
  ON receta_items(producto_id, insumo_id);
```

### Parche — `receta.js`

```js
// el insert suma sobre la línea existente en vez de duplicarla:
const { rows } = await sql`
  INSERT INTO receta_items (producto_id, insumo_id, cantidad)
  VALUES (${producto_id}, ${insumo_id}, ${cant})
  ON CONFLICT (producto_id, insumo_id) DO UPDATE SET cantidad = ${cant}
  RETURNING id, producto_id, insumo_id, cantidad`;

// y el delete, acotado al producto (exigiendo producto_id en el body):
// DELETE FROM receta_items WHERE id=${id} AND producto_id=${producto_id} RETURNING id
```

---

## C4 · MEDIO · El login admite intentos infinitos

**Archivo**: `api/pos.js` → rama `r === 'auth'`

### Causa

La comparación es timing-safe, bien. Pero no hay límite de intentos, y del otro lado hay una sola
contraseña de local compartida — el tipo de contraseña que tiende a ser corta y memorizable porque la
tipean seis personas por turno. Con `Access-Control-Allow-Origin: *`, cualquiera puede probar desde
el navegador sin fricción.

Un límite en memoria por IP no es perfecto en serverless (cada instancia tibia tiene su contador)
pero convierte un ataque de minutos en uno de días, sin agregar infraestructura. Si se quiere algo
real, hace falta una tabla o un KV — decisión del dueño.

### Parche

```js
// arriba de api/pos.js — sobrevive mientras la instancia esté tibia,
// que alcanza para frenar un ataque desde el navegador.
const intentos = new Map(); // ip -> { n, hasta }
const MAX_INTENTOS = 8;
const BLOQUEO_MS = 5 * 60 * 1000;

function chequearIntentos(ip) {
  const e = intentos.get(ip);
  if (e && e.hasta > Date.now()) return false;
  if (e && e.hasta <= Date.now()) intentos.delete(ip);
  return true;
}
function fallo(ip) {
  const e = intentos.get(ip) || { n: 0, hasta: 0 };
  e.n += 1;
  if (e.n >= MAX_INTENTOS) { e.hasta = Date.now() + BLOQUEO_MS; e.n = 0; }
  intentos.set(ip, e);
}

// dentro de la rama 'auth':
const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sin-ip';
if (!chequearIntentos(ip)) {
  return res.status(429).json({ error: "Demasiados intentos. Esperá unos minutos." });
}
if (timingSafeStringEqual(password, POS_PASSWORD)) {
  intentos.delete(ip);
  return res.status(200).json({ ok: true });
}
fallo(ip);
return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
```

---

# TANDA 5 — Preventivo

## C2 · MEDIO · Índices que faltan para las queries de reportes

**Archivo**: `db/schema.sql`

Con ~40 comandas por día el volumen es chico (unas 15.000 comandas y 100.000 líneas al año), así que
no es urgente — pero es el momento barato: los índices se crean en un local vacío y no vuelven a
molestar.

Todas las queries de reportes y finanzas filtran por `cerrada_at` y no hay ningún índice que lo
cubra: `idx_comandas_estado` tiene tres valores distintos, así que el planner termina leyendo la
tabla entera.

```sql
-- el filtro de TODAS las queries de reportes/finanzas
CREATE INDEX IF NOT EXISTS idx_comandas_cerradas
  ON comandas(cerrada_at) WHERE estado = 'cerrada';

-- ranking de productos y top por margen
CREATE INDEX IF NOT EXISTS idx_comanda_items_producto
  ON comanda_items(producto_id) WHERE estado = 'activo';

-- desglose real por medio de pago (JOIN por comanda)
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_comanda
  ON caja_movimientos(comanda_id) WHERE comanda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cc_movimientos_comanda
  ON cuenta_corriente_movimientos(comanda_id) WHERE comanda_id IS NOT NULL;

-- panel de anulaciones
CREATE INDEX IF NOT EXISTS idx_comanda_items_anulados
  ON comanda_items(anulado_at) WHERE estado = 'anulado';
```

> Nota: si se aplica A4, las queries pasan a filtrar por una **expresión** sobre `cerrada_at`, no por
> la columna directa. El índice de arriba sigue sirviendo para el `WHERE cerrada_at >= ${desde}` que
> acota la ventana, pero para los `date_trunc` conviene medir con `EXPLAIN ANALYZE` antes de agregar
> un índice por expresión — con este volumen probablemente no haga falta.

---

## C6 · MEDIO · El costo del mes cambia cuando cambia un precio de compra

**Archivos**: `api/_lib/pos/reportes.js`, `api/_lib/pos/estado-resultados.js`,
`api/_lib/pos/comanda-item.js`, `db/schema.sql`

### Causa

Está documentado como decisión consciente y en su momento fue la correcta, pero conviene ponerle
fecha de vencimiento. `comanda_items` congela el precio pero no el costo, así que el costo variable
de un mes ya cerrado se recalcula con el costo de hoy. Con la inflación argentina, aplicar un precio
de proveedor nuevo en septiembre reescribe el margen de julio hacia abajo — un mes que ya se leyó, se
reportó y quizá se usó para decidir algo.

No requiere migrar el histórico: las filas viejas quedan en NULL y las queries caen a
`productos.costo` como hoy, igual que se hizo con `anulado_at`.

### Parche

```sql
-- migración
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS costo_snapshot numeric(12,4);
```

```js
// comanda-item.js, en el INSERT de una línea nueva: el producto ya está
// lockeado y leído, agregar `costo` al SELECT y guardarlo acá.
// INSERT INTO comanda_items (comanda_id, producto_id, nombre_snapshot,
//   precio_unitario, costo_snapshot, cantidad)
// VALUES (..., ${producto.costo}, 1)
```

```sql
-- reportes.js / estado-resultados.js: preferir el snapshot, caer al
-- costo actual para las líneas viejas que no lo tienen.
SUM(ci.cantidad * COALESCE(ci.costo_snapshot, p.costo, 0)) AS costo
```

---

## UX-1 · El plano de mesas no se refresca

**Archivo**: `public/pos.html`

`handoff/ESTADO-POS.md` dice "auto-refresco cada 10s". **No hay ningún `setInterval` en
`pos.html`**: el plano se recarga solo cuando el mozo hace algo. Con dos o tres teléfonos en el
salón, cada uno ve una foto vieja — una mesa aparece libre, el mozo la toca, y el servidor la rechaza
porque otro ya la abrió.

También explicaría el aviso de "8 minutos con cuenta pedida", que hoy solo avanza si alguien toca
algo.

Un intervalo de 10s sobre `loadMesas()`, pausado cuando la pestaña no está visible
(`document.visibilityState`) o cuando hay una comanda abierta en pantalla. Cuidado de no repintar el
plano mientras el mozo está arrastrando un pin en modo edición.

Corregir también la afirmación en `handoff/ESTADO-POS.md`, que hoy no coincide con el código.

---

# Hallazgos sin parche — requieren decisión

## C5 · MEDIO · El conteo físico y las mermas no dicen en qué unidad están

**Archivo**: `api/_lib/pos/stock-movimiento.js` → `registrarMerma()` / `registrarConteo()`

Hermano menor de A2, y es un hueco de contrato más que un bug. El stock se cuenta en botellas y las
ventas lo descuentan en fracciones; el conteo físico fija el valor directo. Si quien cuenta interpreta
"cantidad contada" como copas disponibles, escribe un número 6 veces mayor y el ajuste queda
registrado como un sobrante enorme — con el detalle de que `registrarConteo` pisa el stock sin pedir
confirmación de la magnitud del delta.

Dos cosas, y la primera es la que importa:

1. En `pos.html`, el input tiene que decir la unidad: "botellas" cuando `unidad_venta` es copa, con
   el equivalente en copas al lado. Hoy dice solo "cantidad".
2. En el backend, rechazar un conteo que mueva el stock más de un umbral sin un `forzar: true`,
   igual que ya hace la venta sin stock en `comanda-item.js`.

## Deuda técnica de `pos.html` — un solo corte, no un refactor

3600 líneas en un archivo no es deuda por sí mismo: sin build step, un archivo es la decisión
correcta y romperlo en módulos ES traería más problemas que los que resuelve. Pero el orden interno sí
importa, y hoy los siete paneles de back-office están intercalados con el flujo de servicio, que es el
único código que se toca bajo presión.

El corte que rinde: mover salón, comanda, cobro y caja a la primera mitad del `<script>`, con un
comentario de sección por bloque, y todo el back-office después. **Nada de mover funciones entre
archivos.** Es un cambio de orden, no de arquitectura, y hace que "arreglar algo del cobro un viernes
a la noche" sea buscar en 1200 líneas y no en 3600.

## Re-render que se come el foco

Cada lista se pinta con `box.innerHTML = …` completo. Funciona y es simple, pero destruye y recrea el
DOM: se pierde el scroll, el foco del input y cualquier texto a medio tipear. Duele en dos lugares
concretos:

- **Panel de clientes**: la búsqueda dispara un render por tecla.
- **Pagos divididos**: los montos son inputs dentro de la lista que se re-renderiza.

No hace falta un framework. Alcanza con no re-renderizar el contenedor que tiene el foco, y en la
lista de pagos escribir en `pagosState` sin repintar las filas — solo el resumen de arriba.

## Dos detalles chicos

- El nombre de la mesa entra al pin del plano sin pasar por `escapeHtml` (`pos.html` línea 968), a
  diferencia del resto del archivo, que lo usa bien y de forma consistente. Riesgo real casi nulo —
  el nombre lo escribe el encargado — pero es una inconsistencia de una línea.
- La contraseña del POS vive en `sessionStorage` en texto plano y viaja como Bearer en cada request.
  Con una clave compartida de local y sin roles es coherente con las decisiones tomadas, así que no
  se cuenta como hallazgo: solo vale saber que el teléfono de un mozo, desbloqueado, es la contraseña
  del sistema.
