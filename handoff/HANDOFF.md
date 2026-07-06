# 125cc · Handoff del sistema de diseño v1

Cómo integrar el sistema en `public/index.html` del repo `125cc-Wine/125cc`.
Pensado para pegarse a mano o dárselo a Claude Code como guía de trabajo.

---

## Paso 1 — Tokens

Pegar el contenido de `tokens.css` al inicio del `<style>`, reemplazando el
`:root` actual. Todos los patches siguientes referencian estas variables.

## Paso 2 — Unificar los colores de tipo (bug detectado)

En el JS hay un objeto `TYPE_COLOR` con valores (#8B0000, #7ab83a, #d94060,
#d4721a) que NO coinciden con los tokens CSS. Las copitas del mapa y los
badges de la carta muestran colores distintos para el mismo tipo de vino.

Reemplazar por:

```js
const TYPE_COLOR = {
  'Tinto':   getComputedStyle(document.documentElement).getPropertyValue('--tinto').trim(),
  'Blanco':  getComputedStyle(document.documentElement).getPropertyValue('--blanco').trim(),
  'Rosado':  getComputedStyle(document.documentElement).getPropertyValue('--rosado').trim(),
  'Naranja': getComputedStyle(document.documentElement).getPropertyValue('--naranja').trim(),
};
```

## Paso 3 — Barrido de valores sueltos

Buscar y reemplazar en el CSS existente:

| Hoy | Token |
|---|---|
| `border-radius: 4px / 8px / 10px` | `var(--r-sm)` |
| `border-radius: 11–16px` | `var(--r-card)` |
| `border-radius: 18–20px` | `var(--r-surface)` |
| botones / chips / inputs de búsqueda | `var(--r-pill)` |
| `box-shadow` con negro (`rgba(0,0,0,…)`) en superficies claras | `var(--shadow-1/2/3)` |
| `transition: … 0.2s/0.3s ease` | `var(--t-local) var(--ease)` |
| `color: #000` o `#333` | `var(--ink)` |
| font-size sueltos | mapear al rol más cercano de la escala |

Regla de mayúsculas: `text-transform: uppercase` + `letter-spacing` queda
SOLO en el rol kicker (11px, tracking .28em, DM Sans 500). Un kicker por
card/pantalla, nunca dos.

## Paso 4 — Card de carta

Estructura nueva (reemplaza el badge numérico circular):

```html
<div class="wine-card">
  <svg class="copita" viewBox="0 0 44 60"><!-- ver Paso 7 --></svg>
  <div class="wine-card-main">
    <div class="wine-card-name">Kamala Pinot Noir</div>
    <div class="wine-card-sub">Dharma Wines · Vista Flores</div>
  </div>
  <div class="wine-card-price">
    <div class="wine-card-price-num">$4.500</div>
    <div class="wine-card-price-cap">copa 125 cc</div>
  </div>
</div>
```

```css
.wine-card {
  display: flex; align-items: center; gap: var(--sp-4);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-card); padding: 18px 20px;
  box-shadow: var(--shadow-1);
  transition: box-shadow var(--t-local) var(--ease), border-color var(--t-local) var(--ease);
}
.wine-card:active { box-shadow: var(--shadow-2); border-color: var(--line-strong); }
.wine-card-name { font-family: var(--font-serif); font-size: var(--text-name); font-weight: 600; color: var(--ink); line-height: 1.15; }
.wine-card-sub { font-size: var(--text-caption); font-weight: 300; color: var(--ink-2); margin-top: 3px; }
.wine-card-price-num { font-family: var(--font-serif); font-size: var(--text-name); font-weight: 600; }
.wine-card-price-cap { font-size: 10px; color: var(--ink-3); }
```

## Paso 5 — Ficha

- **Hero editorial**: contenedor `--bg2`, radio `--r-surface`, título del vino
  en Cormorant 38/700 arriba a la izquierda, precio de copa abajo a la
  izquierda en Cormorant 34/600, y la botella:

```css
.ficha-botella {
  position: absolute; right: -14px; bottom: -36px; height: 330px;
  mix-blend-mode: multiply;             /* funde el fondo blanco del proveedor */
  filter: drop-shadow(-14px 18px 22px rgba(60,35,10,.3)) saturate(1.05);
  transform: rotate(4deg);
}
```

  (`mix-blend-mode: multiply` solo funciona sobre fondos claros — en modo
  cata usar la imagen sin blend o un PNG recortado.)

- **Nota de cata**: eliminar la caja con borde izquierdo. Pull-quote centrado:
  Cormorant italic 20px, kicker "La nota del somm" arriba.

- **Datos técnicos**: eliminar la grilla de cajitas. Lista de contra-etiqueta:
  filas `label + valor` separadas por `border-bottom: 1px solid var(--line)`,
  label en kicker chico (11px, tracking .14em), valor en `--text-data`.

- **Bodega**: banda `--dark`, radio `--r-surface`, texto en Cormorant italic
  17px color `rgba(245,237,224,.85)`, kicker en `--madera`.

- **Barras sensoriales**: alto 3px, track `var(--line)`, fill
  `var(--accent-grad)`, animar `width` de 0 al valor con
  `transition: width .6s var(--ease)` y delay en cascada
  (`0ms / 60ms / 120ms`) al entrar en viewport (IntersectionObserver).

## Paso 6 — Botones (3 niveles, radio píldora)

```css
.btn-primario  { background: var(--accent-grad); color: #fff; box-shadow: 0 4px 20px rgba(155,32,53,.3); }
.btn-secundario{ background: var(--madera-dk); color: var(--ink-dark); }
.btn-terciario { background: none; color: var(--ink-2); border: 1px solid var(--line-strong); }
/* comunes: border-radius: var(--r-pill); padding: 15px; font: 500 12px var(--font-sans);
   letter-spacing: .12em; text-transform: uppercase;
   :active { transform: scale(.98); transition: transform var(--t-feedback) var(--ease); } */
```

Un solo primario por pantalla.

## Paso 7 — La copita (SVG de marca)

Geometría única; variantes por relleno. `viewBox="0 0 44 60"`:

```html
<svg viewBox="0 0 44 60" fill="none">
  <clipPath id="copaClip"><path d="M10 4 H34 V20 C34 30 28.5 36 22 36 C15.5 36 10 30 10 20 Z"/></clipPath>
  <g clip-path="url(#copaClip)">
    <!-- fill: translateY(36px)=vacía · 14px=llena · 8px=seleccionada -->
    <rect x="10" y="4" width="24" height="34" fill="var(--tinto)" opacity=".9"
          style="transition: transform .5s var(--ease); transform: translateY(14px);"/>
  </g>
  <path d="M10 4 H34 V20 C34 30 28.5 36 22 36 C15.5 36 10 30 10 20 Z"
        stroke="var(--madera-dk)" stroke-width="2" stroke-linejoin="round"/>
  <path d="M22 36 V50" stroke="var(--madera-dk)" stroke-width="2" stroke-linecap="round"/>
  <path d="M13 52 H31" stroke="var(--madera-dk)" stroke-width="2" stroke-linecap="round"/>
</svg>
```

En el mapa: seleccionada = `transform: scale(1.35)` con `--ease-copa`,
stroke `--madera`, `filter: drop-shadow(0 0 8px rgba(200,164,106,.65))`.

## Paso 8 — Mapa

- Lienzo: `radial-gradient(ellipse at 50% 45%, #EFE5D5, #DFD2C0 50%, #CDBFAA)`,
  viñeta con un radial transparente→`rgba(60,35,15,.14)` encima, ejes con
  degradado que se desvanece en las puntas (no líneas duras).
- Rótulos de eje: 9px, tracking .3em, `rgba(80,60,40,.6)`.
- Descriptores de cuadrante (opcionales): Cormorant italic 14px,
  `rgba(100,70,40,.34)` — "ligeros y frescos", "profundos de guarda", etc.
- Al seleccionar una copita, atenuar las demás a opacity .45 (filtro: .18).

## Paso 9 — Modo cata (ritual en 3 actos)

1. **Umbral** (fondo claro): título + botón "Apagar las luces".
2. **Cata**: `body` transiciona a `--dark-cata` con
   `transition: background var(--t-ritual) var(--ease)`. Puntaje Parker en
   Cormorant 76/700 — color `--ink-dark`, y `--madera` cuando ≥92.
   Descriptores como chips píldora toggleables.
3. **Cierre**: vuelta al crema a la misma velocidad ("se prenden las luces"),
   puntaje gigante en `--accent` como recuerdo.

## Paso 10 — Microinteracciones (opcionales, JS vanilla)

- Copita que se llena al seleccionar (transform del rect, ya incluido).
- Sommelier: revelar las 3 recomendaciones con 380ms entre cada una.
- Barras sensoriales en cascada al entrar en viewport.

---

Referencias visuales en este proyecto: `125cc Design System.dc.html` (guía),
`Ficha v2`, `Carta v2`, `Mapa del Vino v2`, `Mapa Explorador`, `Modo Cata`.
