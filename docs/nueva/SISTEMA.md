# 125cc

Sistema de diseño de la carta y el cuaderno de cata de 125cc Wine Bar, Mar del Plata. Sale del prototipo aprobado el 22 de octubre de 2026 y es la base para la app en `/nueva`, las piezas de Canva y la tarjeta "Llevate tu noche". El 23 de octubre se le sumó "Más diseño y más botella": profundidad, luz y textura, y las botellas como protagonistas.

La app se usa en la mesa, de noche, con una copa en la mano. Todo lo que sigue parte de eso.

## Principios

- **La app acompaña al sommelier, no lo reemplaza.** Invita a la conversación ("Preguntale al sommelier qué le aporta crecer a 1.400 metros") y nunca la cierra.
- **Anotar una copa: tres toques como máximo.** Lo largo siempre es opcional.
- **Primero dar, después pedir.** El email aparece cuando ya hay una página que vale la pena guardar.
- **Noche por defecto.** El tema `noche` es el primero y el que se ve en el local; `dia` es para fuera del bar.
- **Cada acción deja rastro.** Lo anotado aparece en el mapa, llena la copa, suma una hoja.
- **Sobrio, no plano.** Profundidad, luz y textura sí, como en una vinoteca bien iluminada; puntos, rankings y confeti no.
- **La botella es la protagonista.** Donde aparece un vino aparece su botella: en la lista, en la burbuja del mapa, en su página y en el cuaderno.

## Voz

Español rioplatense, de vos, frases cortas. Habla el sommelier, que es el fundador: con criterio y sin pose.

| Así | Así no |
| --- | --- |
| Tocá una copita para ver el vino | Seleccione un producto del mapa interactivo |
| Coincidiste con el sommelier en **cereza**. | ¡Excelente! Lograste un 33 % de coincidencia |
| Esta vez fueron por lados distintos. En la próxima copa buscá **frambuesa**. | Respuesta incorrecta |
| Todos los vinos de la carta están elegidos. | Opciones económicas |

- La unidad es la copa: "la copa de 125 cc", nunca "porción" ni "trago".
- Nada de ediciones temáticas en ningún texto.
- Los aromas se escriben en minúscula, como en una libreta: cereza, pimienta, flores blancas.
- Los precios con punto de miles y sin decimales: $7.000.

## Fundamentos visuales

**Color.** Dos acentos y nada más. `tinto` es la marca: botón principal, barras de perfil, la copa de la barra inferior. `roble` marca lo que es tuyo o lo que guía: eyebrows, enlaces, insignias de puntaje, el anillo de selección. Los neutros (`bg`, `surface`, `surface-2`) tiran apenas al azul pizarra de noche y al crema de día. Los colores `tipo-*` y `aroma-*` son colores del vino, no de la interfaz: no cambian con el tema y siempre van con una palabra al lado.

**Contraste.** El texto corriente usa `ink` o `ink-soft`, que pasan 4.5:1 sobre todos los fondos. `ink-faint` solo va sobre `bg` o `surface`. En noche, `tinto` nunca va como texto: solo como relleno con `on-tinto` encima.

**Tipografía.** Cormorant Garamond (`display`) para lo que se lee como una carta o una libreta: títulos, nombres de vinos, la nota del somm, precios y puntajes. DM Sans (`ui`) para todo lo que se toca. Las dos vienen de Google Fonts.

**Textura.** `grano` (ruido muy fino, 5 %) va sobre el fondo de la app, el mapa del vino, el mapa del terruño y el papel del cuaderno. El fondo de la app baja en un degradé muy suave de `bg` a `surface`.

**Papel.** El cuaderno suma al grano los renglones cada 28 px, el margen rojo y los agujeros de anillado; una de cada tres páginas lleva la marca de una copa apoyada (anillo de `tipo-tinto` al 6 %). En noche el papel es `papel` apagado, para no encandilar.

**Forma.** Esquinas por rol: `radius-m` en botones y campos, `radius-l` en tarjetas, `radius-hoja` en la hoja que sube, `radius-pill` en chips.

**Profundidad.** Las superficies se apilan con luz, no con bordes:
- `elev-1`: tarjetas (mapa, tu noche, email, opciones y copas de ¿Qué tomo?, la página del vino). Van con `brillo-borde` de fondo: el borde de arriba un poco más claro.
- `elev-2`: lo que flota sobre otra cosa (la hoja que sube, con un borde superior de 1 px más claro, y la burbuja del mapa).
- `sombra-hoja` y `sombra-papel`: la hoja hacia arriba y las páginas del cuaderno.
- `relieve`: lo que se aprieta. El botón principal es un degradé de `tinto` (arriba 8 % más claro) con `relieve` y una sombra de `tinto` al 35 %; al apretar baja 1 px. También lo lleva la insignia del número de carta.

**Movimiento.** Una sola curva (`curva`). Los momentos animados: la hoja que sube (`dur-hoja`), la botella que entra subiendo 24 px al abrir un vino (`dur-botella`), la copa que se llena de a 25 cc (`dur-copa`), el círculo de puntaje que se dibuja (`dur-trazo`) y lo que aparece de a uno con `escalonado` entre cada pieza: los aromas del revelado y las barras del perfil. Al tocar una fila de la carta, la botella se acerca (`scale(1.04)`, `dur-rapida`). Con "reducir movimiento", todo aparece quieto.

## Iconografía e ilustración

- **La copita.** Cáliz del color del tipo de vino con el número de carta adentro. Es el marcador del mapa y aparece en la tarjeta para compartir.
- **El trazo a mano.** Un círculo abierto en `papel-margen`, como el que se hace con birome sobre una libreta. Rodea los puntajes.
- **Sellos.** Doble círculo con el nombre de la región; los sellos de aroma son rectángulos de goma levemente girados.
- **Botellas.** La foto de cada botella sobre fondo transparente, servida por la optimización de imágenes de Vercel, siempre dimensionada por el alto (los lienzos de las fotos son distintos). Dos puestas:
  - *Nicho* (lista de la carta, burbuja del mapa): la botella de 64 px en un hueco `surface-2` con un foco de luz del color del tipo al 18 %, y el número de carta como insignia en la esquina. Miniaturas de 96w/192w, con carga diferida.
  - *Escena* (página del vino a 300–340 px, ¿Qué tomo? a 120 px): un halo del color del tipo al 35 % atrás, el reflejo en el piso (la misma imagen invertida al 18 %, que se apaga en 40 px) y una sombra elíptica bajo la base. En la página del vino la botella sale 60 px por arriba de la tarjeta y el nombre, la bodega y el precio van debajo. Foto de 640w, que se pide recién al abrir el vino.

  El dibujo de botella es el respaldo cuando falta la foto, con el mismo halo y reflejo.
- **Íconos de interfaz.** Línea de 1.6 px, puntas redondeadas, 22 px; los de los datos de la ficha (región, altitud, suelo, varietal, crianza, temperatura, copa), 18 px en `roble`. Sin emoji.

Los cuatro dibujos están en Assets → Ilustraciones, listos para Canva.

## Mapa del vino

Dos ejes, siempre los mismos: Fresco ↔ Complejo y Suave ↔ Potente. El fondo `mapa` es más cálido que la app para que el mapa se lea como un objeto aparte: lleva grano, el centro apenas más claro y los cuadrantes teñidos al 6 % desde su esquina (fresco y liviano verdoso, potente y complejo bordó).

- Palabras de eje en mayúsculas espaciadas y una frase por cuadrante en cursiva ("Fresco y liviano", "Potente y complejo"…), las dos en `mapa-rotulo` (la `mapa-etiqueta` corrida hacia `ink`, para no bajar de 4.5:1 sobre el fondo teñido).
- Marcas cada 25 % sobre los ejes. Las copitas quedan fuera de las franjas de arriba y de abajo, donde van las palabras.
- Copitas de vidrio: el vino se oscurece hacia abajo y el cáliz lleva un reflejo blanco al 35 % del lado izquierdo.
- El primer toque en una copita abre una burbuja con la botella, el nombre y el precio; el segundo toque, o tocar la burbuja, abre la página del vino.

## Cómo se usa

- En código: cargá el `tokens.css` de este sistema (lo genera la página) en `public/nueva/css/tokens.css` y usá solo esas variables. HTML, CSS y JS vanilla: sin frameworks ni build.
- En Canva: armá un kit de marca con `tinto`, `roble`, `papel` y los dos neutros de noche, las dos tipografías y las ilustraciones de Assets.
- Los componentes de abajo muestran cada pieza con sus reglas. El prototipo completo está en `docs/nueva/prototipo.html` del repo winebar-menu.
