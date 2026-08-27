# 125cc Wine Bar — contexto del producto

125cc es un wine bar en Mar del Plata. Este repo (`125cc-Wine/125cc`) es su
app web: el menú que los clientes ven al escanear el QR de la mesa (o entrar
desde el link de Instagram), más el panel admin para el mozo/dueño.

## El concepto del menú (`public/index.html`)

La página principal **es la carta de vinos** — no un menú general con comida,
aunque `vinos.json` tenga también `bar` (metadata del local) y `charcuteria`
(datos sin usar hoy en la UI; no asumir que están vivos). El menú tiene tres
capas, todas sobre los mismos 14 vinos activos:

1. **Mapa cartesiano** (`.map-canvas`, tab implícito antes de "Carta") — cada
   vino es un punto ubicado por carácter, no por tipo. Eje horizontal
   Fresco ↔ Complejo, eje vertical Suave ↔ Potente. Es la puerta de entrada:
   se explora por sensación antes que por nombre.
2. **Carta** (`tab-carta`, `.wine-card`, `renderWineList()`) — la lista
   tradicional: nombre, bodega, precio, tipo. Buscador por nombre/bodega.
3. **Ficha** (`tab-ficha`, `fichaContent`) — el detalle profundo de un vino
   al tocarlo desde el mapa o la carta: nota de cata, maridaje, datos
   técnicos (varietal, región, altitud, suelo, crianza, temperatura),
   info de bodega, barras sensoriales (cuerpo/frescura/taninos).

Todo entra por el mapa o la carta y termina en la ficha — es el mismo flujo
de "elegí por sensación → confirmá con el detalle" repetido para cada vino.

## Datos (`public/vinos.json` → `vinos[]`)

Cada vino trae, entre otros campos:

- `x`, `y` — posición en el mapa cartesiano. **Se cargan a mano** desde el
  admin (`api/actualizar-mapa.js`), no se derivan de otro campo. Rango
  aproximado -60..60 en ambos ejes; conversión a pantalla en
  `index.html` (`left = 50 + x*0.4`, `top = 50 - y*0.36`).
- `perfil_cuerpo`, `perfil_frescura`, `perfil_taninos` (escala 1–5) — usados
  para las barras sensoriales de la ficha, **no** para calcular `x`/`y`.
- `tipo` (Tinto/Blanco/Rosado/Naranja), `varietal`, `region`, `altitud`,
  `suelo`, `crianza`, `temperatura`, `nota`, `maridaje[]`, `bodega_info`,
  `precio`, `imagen`.

⚠️ **Pendiente de revisar (no resuelto, no tocar sin conversarlo primero):**
al cruzar `x`/`y` con `perfil_*` en el catálogo actual, el eje vertical
(Potente/Suave) se parece más a "es tinto vs. es blanco/rosado" que a
intensidad real. Ejemplos: `Alta Vista Estate Pinot Noir` y `Kamala Pinot
Noir` tienen `perfil_cuerpo=2` y `perfil_taninos=2` (livianos) pero están
cargados con `y` positivo (lado Potente), mientras que todos los blancos/
rosados caen en `y` negativo sin excepción. Como `x`/`y` se cargan a mano,
puede ser simplemente que no se recalibraron con `perfil_*` al ponerlos.
Antes de tocar el mapa o los ejes, conversarlo — no es un bug de código.

## Reglas de negocio que no se ven en el código

- **Rotación de carta cada 14 días** — el catálogo completo se recambia, no
  son altas/bajas puntuales. Ver `[[project_125cc_carta_rotation]]` en
  memoria: prioriza en el editor admin (`public/stats.html`) todo lo que
  reduzca fricción en un recambio masivo (plantillas, edición en lote,
  vista tipo planilla) sobre mejoras pensadas para ediciones aisladas.
- **Sesión única vía QR** — no es una app instalable ni de visitas
  recurrentes (ver `[[project_125cc_qr_menu_context]]`). "Premium" acá es
  velocidad de carga en wifi de bar, fotos de botella consistentes, pulido
  de la interacción mapa/sommelier — no cuentas, notificaciones ni memoria
  entre sesiones.
- **Salón fue removido del menú** — no volver a proponer editor de
  mesas/plano sin un dolor concreto nuevo (`[[project_ct_salon_removed]]`
  es de Cuarto Trasero, pero el mismo criterio aplica acá: no agregar
  gestión de mesas/salón sin que lo pidan).

## Sistema de diseño

`public/tokens.css` — tokens de color/tipografía/espaciado/sombra. Ver
`handoff/HANDOFF.md` para la guía de integración componente por componente
(cards, ficha, botones, la copita SVG de marca, mapa, modo cata).

## Convenciones de trabajo en este repo

- Commit + push sin volver a preguntar tras la primera confirmación en la
  sesión (ver memoria `feedback-125cc-autocommit`).
- Mapear filas de sheets por nombre de columna, nunca por posición fija
  (causó un bug de datos en blanco — ver memoria
  `project-125cc-sheet-column-mapping`).
