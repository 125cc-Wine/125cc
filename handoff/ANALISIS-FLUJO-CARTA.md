# Flujo de la carta: del calendario al vino en el local

Análisis pedido el 06/10/2026 ("analizá el flujo de toda la app, front y
back, y nuestro flujo de trabajo por detrás para que cada vino esté en el
local semana a semana"). Mira el recorrido completo de un vino desde que se
elige en el Calendario de Carta hasta que se sirve, con los datos reales de
la base al 06/10.

## El recorrido hoy, paso a paso

| # | Paso | Dónde | Automático / manual |
|---|------|-------|---------------------|
| 1 | Elegir los 14 vinos de cada quincena | `stats.html` → Calendario de Carta, sobre el catálogo Aroma/La Vid (Supabase de gestion-vinoteca) | Manual. Bloqueo de 12 meses para no repetir vinos |
| 2 | Guardar | `api/actualizar-vino.js` → `carta_historial` (Neon) + borrador en el Sheet con nombre/bodega/precio/tipo/varietal/región | Automático al guardar |
| 3 | Completar la ficha (nota, maridaje, foto, perfil) | `stats.html` → Editor de Vinos. El perfil ubica el vino en el mapa solo | Manual. El banner del Calendario avisa qué falta |
| 4 | Precio | Se congela el del catálogo al confirmar. El cron diario `sync-precios` lo pisa con el de `tienda_url` si cambió | Automático |
| 5 | **Conseguir las botellas y llevarlas al local** | Pestaña Pedidos y Rentabilidad (cajas por bodega)… y después, fuera del sistema | **Manual, sin registro** |
| 6 | Cambio de carta el día 1 y el 16 | `api/obtener-vinos.js` numera los vinos de la quincena vigente; `index.html` muestra solo esos | Automático (hora Argentina) |
| 7 | Servir y cobrar | `pos.html`: productos importados desde el Sheet con `productos-import` | Manual (botón de importar). El POS todavía no está en uso |

Los pasos 1–4 y 6 están bien resueltos. El problema está en el **paso 5**:
es el único que hace que el vino esté físicamente en el local, y es el único
que no pasa por ningún sistema.

## Lo que muestran los datos (06/10)

- **Fichas:** las 6 quincenas de octubre a diciembre tienen todas las fichas
  completas (nota, foto, maridaje, precio). ✅
- **Carta en vivo:** muestra los 14 vinos de la Q1 de octubre. ✅
- **Vinos por quincena:** la Q1 de noviembre tiene **11 de 14** y la Q1 de
  diciembre **13 de 14**. Si no se completan, la carta sale con menos vinos.
- **Stock en gestion-vinoteca** (en vivo, se mueve día a día):
  - El 05/10: 3 sin stock en la Q1 de octubre y 6 en la Q2.
  - El 06/10 ya había bajado a 1 en la Q1 (Alta Vista Alizarine) y 2 en la
    **Q2, que arranca el 16/10** (Uruco Merlot, Zolo Black Cabernet Franc).
  - Desde el 06/10 el banner del Calendario avisa esto solo (ver abajo).
- **Cajas:** **0 de 80** vinos planificados tienen cajas cargadas, así que la
  pestaña Pedidos no tiene nada que consolidar.
- **125cc no existe en gestion-vinoteca:** no hay cliente, pedido, venta ni
  consignación a nombre de 125cc. Las botellas que van al bar no dejan rastro.
  El stock de la vinoteca no las descuenta, salvo que alguien lo haga a mano
  por otro lado, y no hay forma de saber si llegaron.
- **POS:** tiene 14 vinos importados el 28/08 y **ninguno es de la carta de
  hoy**. El import es manual y ningún vino tiene stock cargado.

## Huecos, ordenados por impacto

1. **Nadie mira el stock antes de que arranque la quincena.** Desde ayer
   el stock se ve en el Calendario, pero solo si entrás a mirarlo. Si un
   vino sin stock llega al día 16, sale en la carta y no hay botella.
2. **El paso físico no deja registro.** Sin un movimiento en
   gestion-vinoteca, el stock de la vinoteca queda mal (miente para la web y
   para el portal) y no hay un "recibido en el local" que confirme que la
   quincena está lista.
3. **Las cajas no se cargan.** Sin cantidades, la pestaña Pedidos no sirve
   para pedir y la rentabilidad por quincena no tiene base.
4. **Quincenas incompletas** (Q1 de noviembre 11/14, Q1 de diciembre 13/14).
5. **El POS no sigue la carta.** No bloquea nada hoy porque no está en uso,
   pero antes de lanzarlo tiene que importar solo los vinos de cada quincena.
   Si no, el mozo cobra vinos que ya no están en la carta.
6. **Dependencia de la clave anon de Supabase.** El catálogo y el stock se
   leen con la clave pública. Al cerrar la base con RLS (pendiente en
   gestion-vinoteca), el Calendario se queda sin catálogo y sin stock si no
   se ajusta en el mismo paso.

## Propuesta de flujo por quincena

Contando hacia atrás desde el día de arranque (1 o 16):

| Cuándo | Qué | Herramienta |
|--------|-----|-------------|
| T-30 o antes | Quincena confirmada con 14 vinos y fichas completas | Calendario + Editor (ya funciona) |
| **T-10** | **Chequeo de stock.** Los vinos sin stock se compran a la bodega o se cambian por otro | Calendario, con alerta en el banner de la próxima quincena |
| **T-7** | **Pedido interno 125cc** con cajas por vino, generado desde el Calendario como pedido en gestion-vinoteca (cliente "125cc") | Calendario → gestion-vinoteca |
| **T-2** | **Recibido en el local:** se marca el pedido como entregado y el stock de la vinoteca se descuenta solo | gestion-vinoteca (ya tiene `entregado_at`) |
| Día 1/16 | Cambio de carta automático + POS con los vinos nuevos | `obtener-vinos` + import automático en el POS |
| Fin de quincena | Las botellas que sobran vuelven a la vinoteca o quedan en el bar | Devolución en gestion-vinoteca |

## Qué haría primero

1. **Ya:** resolver los vinos sin stock de la Q2 de octubre (arranca el
   16/10) y completar los huecos de noviembre y diciembre.
2. ✅ **Hecho (06/10): aviso de stock en el banner** para la quincena en
   curso y la siguiente. Avisa los vinos sin stock y los que no cubren las
   cajas pedidas (1 caja = 6 u.), se pone en rojo a 10 días del arranque y
   relee el stock en vivo al volver a la pestaña o con "Actualizar stock".
3. **Pedido interno 125cc generado desde el Calendario.** Es lo que cierra
   el hueco del paso 5: las cajas pasan a tener sentido, el stock de la
   vinoteca queda bien y queda un "recibido" por quincena. Necesita definir
   antes si se registra como venta, consignación o transferencia, y a qué
   precio.
4. **Import automático del POS** al cambiar la quincena, antes de lanzarlo.
