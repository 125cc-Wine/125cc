# 125cc

Sistema de diseño de la carta y el cuaderno de cata de 125cc Wine Bar, Mar del Plata. Sale del prototipo aprobado el 22 de octubre de 2026 y es la base para la app en `/nueva`, las piezas de Canva y la tarjeta "Llevate tu noche".

La app se usa en la mesa, de noche, con una copa en la mano. Todo lo que sigue parte de eso.

## Principios

- **La app acompaña al sommelier, no lo reemplaza.** Invita a la conversación ("Preguntale al sommelier qué le aporta crecer a 1.400 metros") y nunca la cierra.
- **Anotar una copa: tres toques como máximo.** Lo largo siempre es opcional.
- **Primero dar, después pedir.** El email aparece cuando ya hay una página que vale la pena guardar.
- **Noche por defecto.** El tema `noche` es el primero y el que se ve en el local; `dia` es para fuera del bar.
- **Cada acción deja rastro.** Lo anotado aparece en el mapa, llena la copa, suma una hoja.
- **Sobrio, no infantil.** Sellos de pasaporte sí; puntos, rankings y confeti no.

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

**Papel.** El cuaderno es el único lugar con textura: renglones cada 28 px, margen rojo, agujeros de anillado. En noche el papel es `papel` apagado, para no encandilar.

**Forma.** Esquinas por rol: `radius-m` en botones y campos, `radius-l` en tarjetas, `radius-hoja` en la hoja que sube, `radius-pill` en chips. Solo dos sombras: `sombra-hoja` y `sombra-papel`.

**Movimiento.** Una sola curva (`curva`). Tres momentos animados: la hoja que sube (`dur-hoja`), la copa que se llena de a 25 cc (`dur-copa`) y el círculo de puntaje que se dibuja (`dur-trazo`). Con "reducir movimiento", todo aparece quieto.

## Iconografía e ilustración

- **La copita.** Cáliz del color del tipo de vino con el número de carta adentro. Es el marcador del mapa y aparece en la tarjeta para compartir.
- **El trazo a mano.** Un círculo abierto en `papel-margen`, como el que se hace con birome sobre una libreta. Rodea los puntajes.
- **Sellos.** Doble círculo con el nombre de la región; los sellos de aroma son rectángulos de goma levemente girados.
- **Botellas.** En la app real, la foto de cada botella sobre fondo transparente, servida por la optimización de imágenes de Vercel. El dibujo de botella es solo el respaldo cuando falta la foto.
- **Íconos de interfaz.** Línea de 1.6 px, puntas redondeadas, 22 px. Sin emoji.

Los cuatro dibujos están en Assets → Ilustraciones, listos para Canva.

## Mapa del vino

Dos ejes, siempre los mismos: Fresco ↔ Complejo y Suave ↔ Potente. Palabras de eje en `mapa-etiqueta`, mayúsculas espaciadas. El fondo `mapa` es más cálido que la app para que el mapa se lea como un objeto aparte.

## Cómo se usa

- En código: cargá el `tokens.css` de este sistema (lo genera la página) en `public/nueva/css/tokens.css` y usá solo esas variables. HTML, CSS y JS vanilla: sin frameworks ni build.
- En Canva: armá un kit de marca con `tinto`, `roble`, `papel` y los dos neutros de noche, las dos tipografías y las ilustraciones de Assets.
- Los componentes de abajo muestran cada pieza con sus reglas. El prototipo completo está en `docs/nueva/prototipo.html` del repo winebar-menu.
