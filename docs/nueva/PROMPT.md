# 125cc · Nueva carta en /nueva

## Qué hay que hacer

Construir la nueva versión de la carta de 125cc en una ruta paralela, **`/nueva`**, con el diseño del prototipo aprobado (`docs/nueva/prototipo.html`) y con los **datos, fotos y endpoints reales** de la app actual.

La app actual (`public/index.html`) y el panel (`public/stats.html`) **no se tocan**. Cuando la nueva esté aprobada se reemplaza en otro paso.

Trabajá en una rama nueva: `nueva-carta`.

## Reglas fijas

- Stack: HTML, CSS y JS vanilla. **Sin frameworks, sin React, sin Tailwind, sin build.** Módulos nativos del navegador (`<script type="module">`).
- El prototipo es la fuente de verdad de la experiencia: layout, tokens de color y tipografía, textos, interacciones y animaciones. Reutilizá su CSS y su lógica; en el prototipo está todo en un archivo, acá va partido en módulos.
- Colores, tipografías y tiempos de animación solo desde tokens. Partí de `/paleta.css` y sumá los tokens del prototipo en `public/nueva/css/tokens.css`.
- El precio de la copa sale siempre de `calcularPrecioCopa()` de la app actual: se calcula en el momento, **nunca se guarda**.
- No cambies los endpoints de `/api` ni el formato de `vinos.json` sin listarme antes el cambio.
- Para reutilizar funciones de `public/index.html`, **copialas** a módulos nuevos en `public/nueva/js/`. No las muevas: la app actual tiene que seguir funcionando igual.
- Todo en español rioplatense, como el prototipo.

## Sistema de diseño

En `docs/nueva/` también están:

- `tokens.css`: colores (noche por defecto, día con `data-theme="dia"`), tipografías, espaciados, radios, sombras y tiempos de animación. Copialo a `public/nueva/css/tokens.css` y usá solo esas variables: nada de colores ni tamaños sueltos.
- `SISTEMA.md`: el manual de marca, con la voz, los principios, el contraste y las reglas de cada componente. Respetalo en textos y en estilos.
- `ilustraciones/`: copita, círculo a mano, sello y botella de respaldo en SVG.

**Si hay diferencias, los valores de `tokens.css` ganan sobre los del prototipo.** Algunos colores se ajustaron para que el texto pase 4.5:1 de contraste. `tinto` nunca va como texto en el tema noche, y `ink-faint` va solo sobre `bg` o `surface`.

## Paso 1 · Leer y proponer (antes de escribir código)

Leé `public/index.html`, `vercel.json`, la carpeta `api/` y el prototipo. Después mandame un resumen corto con:

1. De dónde salen los vinos de `/api/obtener-vinos`: si de `vinos.json`, del Editor de Vinos de `/stats` o de la API de gestion-vinoteca.
2. El formato exacto que usa hoy `enviarPuntuacion()` para mandar una cata a `/api/guardar-puntuacion`, y cómo trae `buscarMisCatas()` las catas por email.
3. Qué columnas nuevas harían falta en la hoja de cálculo de catas para guardar los campos nuevos (ver "Catas" más abajo). El Apps Script detecta columnas por nombre de encabezado.
4. Tu plan de archivos.

Esperá mi OK antes de seguir.

## Estructura

```
public/nueva/
  index.html
  css/tokens.css      tokens del prototipo, alineados con /paleta.css
  css/app.css
  js/app.js           arranque, vistas, barra inferior, rutas por hash
  js/datos.js         carga de vinos, filtro de listos, precio de copa, mapeo de campos
  js/imagenes.js      URLs de fotos optimizadas y respaldo con dibujo
  js/mapa.js          mapa del vino (copitas)
  js/hoja.js          hoja que sube, arrastre para cerrar, botón atrás
  js/ficha.js         página del vino
  js/cata.js          cata rápida, cata completa, rueda de aromas, revelado
  js/store.js         cuaderno local y sincronización con el servidor
  js/cuaderno.js      vista Mi cuaderno, paladar, sellos
  js/somm.js          ¿Qué tomo?
  js/tarjeta.js       "Llevate tu noche"
```

## Recursos visuales

### Fotos de botella optimizadas por Vercel

Hoy las 11 fotos de la carta son PNG sin fondo de 170 KB a 1,1 MB cada una (≈6 MB en total) y se cargan todas al abrir la carta. Hay que servirlas con la optimización de imágenes de Vercel.

1. En `vercel.json` agregá (sumándolo a lo que ya exista, sin borrar rewrites ni headers):

```json
"images": {
  "sizes": [96, 192, 320, 640],
  "formats": ["image/webp"],
  "qualities": [75],
  "minimumCacheTTL": 2592000,
  "remotePatterns": [
    { "protocol": "https", "hostname": "9j5ebfwhvwtvrhy9.public.blob.vercel-storage.com", "pathname": "^/vinos/.*$" },
    { "protocol": "https", "hostname": "www.aromadevid.com.ar", "pathname": "^/wp-content/uploads/.*$" }
  ]
}
```

2. En `js/imagenes.js`, un helper:

```js
export function foto(url, w) {
  if (!url) return null;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return url; // en local no hay optimizador
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}
```

3. Dónde va cada tamaño:
   - **Carta y mapa:** sin fotos. Copitas y lista dibujadas, como en el prototipo. La carta tiene que abrir al instante.
   - **Página del vino:** la foto real ocupa el lugar del dibujo de botella del prototipo, sobre el mismo foco de luz radial, con `srcset` de 320w y 640w, `width`/`height` fijos para que no salte el layout y una sombra suave (`filter: drop-shadow`).
   - **¿Qué tomo? (resultados):** 96w y 192w.
   - **Tarjeta "Llevate tu noche":** 320w. Al venir del mismo dominio, el canvas no queda bloqueado.
   - **Respaldo:** si un vino no tiene `imagen` o la foto falla (`onerror`), usá el dibujo `bottleSVG()` del prototipo.
4. Fuera de la página del vino, las fotos van con `loading="lazy"`.
5. Revisá en el panel de Vercel el uso de Image Optimization después de la primera semana.

### Mapa del terruño

Recuperá el mapa de la bodega (Leaflet + mapa base del IGN, `ensureLeafletLoaded()` y `renderBodegaMapa()` de la app actual) dentro del bloque "Sobre la bodega" de la página del vino. Leaflet se carga recién cuando el bloque se ve o cuando la persona toca "Ver en el mapa", nunca al abrir la carta.

### Tarjeta "Llevate tu noche"

Igual que en el prototipo (canvas de 1080×1920), con las fotos reales de cada botella en lugar de las copitas dibujadas. Para compartir:

- Si `navigator.canShare({ files })` da verdadero, el botón "Compartir" manda el PNG al menú de compartir del teléfono (Instagram, WhatsApp).
- Si no, mostrá la imagen y un botón "Descargar".

## Datos

### Vinos

Usá la misma carga que la app actual: `/api/obtener-vinos`, con respaldo a `vinos.json` y la caché local `125cc_wines_v1`. Mostrá solo los vinos "listos" con la misma lógica de `filtrarVinosListos()` / `vinoListoParaMenu()`.

Mapeo al modelo del prototipo: `numero` → `n`, `precio` (góndola) → `copa` con `calcularPrecioCopa()`, `tienda_url` → `tienda`, más `bodega_lat` y `bodega_lon` para el mapa del terruño. El resto de los campos tiene el mismo nombre.

### Campos nuevos (opcionales)

- `aromas_somm`: lista de aromas, usando solo el vocabulario de `FAMILIAS` del prototipo.
- `color_somm`: un color de la lista `COLORES` correspondiente al tipo de vino.

Agregalos donde se editan hoy los vinos: en el Editor de Vinos de `/stats`, con un selector múltiple de aromas agrupado por familia y un selector de color según el tipo.

Si resulta que los vinos salen de gestion-vinoteca (otro repo), **no lo toques**: anotá qué habría que cambiar allá y avisame.

Si un vino no tiene estos campos, el revelado oculta esas partes (el prototipo ya lo hace).

## Catas y cuaderno

- **Guardado local primero**, como el prototipo (`store.js`): cada página se guarda en el celular con una copia del vino. Clave nueva: `125cc-cuaderno-v1`.
- **Sin páginas de ejemplo.** El cuaderno real arranca vacío, con el estado vacío del prototipo. Sacá también la etiqueta "Prototipo" y las notas de prototipo.
- **Email:** reutilizá la clave `125cc_email` que ya existe. Si hay email, cada página se manda al servidor con `/api/guardar-puntuacion`, respetando el formato actual de `enviarPuntuacion()` y sumando los campos nuevos: `modo` (rápida o completa), `impresion`, `aromas`, `intensidad_aromatica`, perfil percibido (`cuerpo`, `frescura`, `taninos`), `final`, `repetiria` y `nota`.
- **Columnas nuevas en la hoja:** antes de mandar campos nuevos, listame las columnas que hay que agregar. No asumas que existen.
- **Sin conexión:** si el envío falla, la página queda marcada como pendiente y se reintenta al volver a abrir la app.
- **Al dejar el email** en Mi cuaderno: traé las catas que ya existen con la búsqueda actual de "Mis catas" y sumalas como páginas, mapeando color, aromas, boca y puntuación.
- **Editar y borrar** una página usan `/api/editar-cata` y `/api/borrar-cata`, como hoy.
- **WhatsApp:** mantené el envío actual (`/api/send-whatsapp`) como botón opcional en el revelado: "Mandámelo por WhatsApp".

## ¿Qué tomo?

Usá la lógica del prototipo y sumale el voto arriba/abajo en cada resultado, mandándolo a `/api/stats` igual que `marcarFeedbackSomm()` hoy.

## Enlaces y medición

- **Enlaces viejos:** `/nueva#vino=35` tiene que abrir la página de ese vino, para que sigan sirviendo los enlaces de "Compartir".
- **Eventos:** registrá en `/api/stats`, si el endpoint acepta eventos nuevos (si no, listame qué haría falta): `abrir_vino`, `anotar_rapida`, `anotar_completa`, `paso_cata` (con el número de paso), `revelado`, `email_guardado`, `llevate_noche`, `quiz_resultado`.

## Cómo probarlo

1. Probalo en local en 390 px de ancho, con DevTools en modo celular, en tema noche y en tema día.
2. Recorré el flujo completo:
   - abrir un vino desde el mapa y desde la lista;
   - cata rápida en tres toques;
   - cata completa con los cinco pasos y el revelado;
   - Mi cuaderno, Tu paladar, sellos y "Llevate tu noche";
   - ¿Qué tomo?;
   - cerrar la hoja con la X, arrastrando y con el botón atrás del celular.
3. Con DevTools → Network, verificá estas tres cosas en el preview de Vercel:
   - las fotos pasan por `/_vercel/image` y pesan decenas de KB, no cientos;
   - la carta inicial no descarga ninguna foto;
   - Leaflet no se carga hasta abrir el mapa del terruño.
4. Subí la rama `nueva-carta` y pasame el link de preview de Vercel.

## Qué me tenés que devolver al final

- Resumen de los cambios, archivo por archivo.
- Columnas nuevas de la hoja de catas.
- Cambios necesarios en gestion-vinoteca, si los hay.
- Link de preview de `/nueva`.
- Lo que quedó pendiente, por ejemplo el service worker para funcionar sin conexión, que va en otra tarea.
