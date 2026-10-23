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

- `perfil_cuerpo`, `perfil_frescura`, `perfil_taninos` (escala 1–5, cargados
  a mano en el Sheet) — fuente única tanto de las barras sensoriales de la
  ficha como de la posición en el mapa. **Ya no hay columnas `x`/`y` que
  cargar**: `api/obtener-vinos.js` (`posicionDesdePerfil()`) las calcula en
  cada lectura —
  `x` (Fresco -100..Complejo +100) = `((3-frescura)*0.6 + madera*0.8 +
  (taninos-3)*0.3)*50`, donde `madera` sale de los meses en roble que
  `maderaDesdeCrianza()` lee del texto libre de `crianza` (sin dato →
  se estima por taninos). Hasta el 24/09/2026 era solo `(3-frescura)*50`:
  5 columnas posibles y media quincena apilada en x=0.
  `y = ((cuerpo+taninos)/2 - 3)*50` (Suave -100..Potente +100) — y las
  manda ya resueltas en el JSON; `index.html` solo convierte a pantalla
  (`left = 50 + x*0.4`, `top = 50 - y*0.36`) y `separarPines()` aparta
  las copitas que quedan a menos de 8% entre sí. Cargar `perfil_*` y
  `crianza` de un vino nuevo ya lo posiciona bien — no hace falta ningún
  paso manual aparte.
  El panel "editor de mapa" de `stats.html` (arrastrar copitas a mano) y
  `api/actualizar-mapa.js` se **sacaron del admin** (04/09/2026) por quedar
  sin efecto real — para reposicionar un vino se edita su
  `perfil_cuerpo`/`perfil_frescura`/`perfil_taninos` en el Editor de Vinos,
  no hay un paso de mapa aparte.
- `tipo` (Tinto/Blanco/Rosado/Naranja), `varietal`, `region`, `altitud`,
  `suelo`, `crianza`, `temperatura`, `nota`, `maridaje[]`, `bodega_info`,
  `precio`, `imagen`.

✅ **Resuelto (era el hallazgo pendiente de antes):** el eje Potente/Suave
se parecía a "es tinto vs. es blanco/rosado" porque `x`/`y` se cargaban a
mano sin relación real con `perfil_*` — se podían desincronizar sin que
nada lo notara. Ejemplo real que lo confirmó: `Alta Vista Estate Pinot
Noir` y `Kamala Pinot Noir`, livianos según su propio `perfil_cuerpo`/
`perfil_taninos` (=2), quedaban del lado Potente solo por ser tintos.
Con la derivación automática (03/09/2026) ya no puede volver a pasar:
la posición SIEMPRE sale de `perfil_*`, no hay un segundo valor cargado
a mano que se pueda desalinear.

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

## Carta nueva en `/nueva` (rama `nueva-carta`, en paralelo a la actual)

Versión nueva de la carta según el prototipo aprobado
(`docs/nueva/prototipo.html`, fuente de verdad de la experiencia). HTML/CSS/JS
vanilla con módulos nativos en `public/nueva/js/` (sin build). `public/index.html`
sigue igual hasta que se apruebe el reemplazo; las funciones que se reusan
están **copiadas** (marcadas "copia de public/index.html").

- Suma un **cuaderno** (catas guardadas en el celular, `125cc-cuaderno-v1`) que
  se sincroniza con la hoja Degustaciones si la persona deja su email
  (`125cc_email`, el mismo de "Mis catas"). Es una excepción deliberada al
  criterio de "sesión única" de arriba: la decidió el dueño con el prototipo.
- Columnas nuevas en Degustaciones: `Impresion`, `Intensidad color`,
  `Intensidad aromatica`, `Repetiria`, `App`. La frescura percibida va en
  `Acidez`, el modo en `Nivel` (rápida=simple, completa=sommelier) y el final
  Corto/Medio/Largo en `Final` como 2/3/4.
- Columnas nuevas en Vinos: `aromas_somm` (solo vocabulario de `FAMILIAS` en
  `public/nueva/js/datos.js`, duplicado en `stats.html`) y `color_somm`. Se
  cargan en el Editor de Vinos; sin dato, el revelado oculta esa parte.
- Eventos de uso → `POST /api/stats {evento}` → tabla `eventos_carta` (Postgres).
- Fotos por `/_vercel/image` (bloque `images` de `vercel.json`): la lista baja
  solo miniaturas (96w/192w, lazy) y la foto grande (640w) se pide al abrir el
  vino; el mapa no carga fotos. Las fotos se dimensionan por el alto (lienzos
  distintos), ver `js/imagenes.js`. Leaflet se carga recién al ver el bloque
  de la bodega.
- **Sistema de diseño propio:** `docs/nueva/tokens.css` (copiado tal cual a
  `public/nueva/css/tokens.css`) + `docs/nueva/SISTEMA.md` (voz, contraste,
  componentes). `app.css` usa solo esas variables; noche por defecto, día con
  `data-theme="dia"`. `tinto` nunca como texto de noche; `ink-faint` solo sobre
  `bg`/`surface`. No usa `/paleta.css` ni `public/tokens.css` (los de la carta
  actual): los nombres chocan (`--tinto`, `--papel`). Desde el 23/10 suma
  profundidad (`elev-*`, `brillo-borde`, `grano`, `relieve`) y las botellas en
  nicho y en escena: eso gana sobre "sobrio" y "solo dos sombras" del
  manual original (`SISTEMA.md` ya está actualizado).

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
