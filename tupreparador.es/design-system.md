# Design System — Tu Preparador

## Portales de app (dark theme)

### Tokens CSS (shared.css — estado actual)
```css
--bg:    #0c0c0c              /* Fondo principal */
--bg2:   rgba(255,255,255,0.04)  /* Fondo tarjetas glass */
--bg3:   rgba(255,255,255,0.07)  /* Fondo inputs/hover */
--text:  #fff
--text2: rgba(255,255,255,0.5)
--text3: rgba(255,255,255,0.25)
--border:  rgba(255,255,255,0.08)
--border2: rgba(255,255,255,0.15)
--blue:   #00d2ff   /* Cyan eléctrico */
--green:  #1D9E75
--amber:  #BA7517
--red:    #E24B4A
--purple: #7F77DD
--radius:    12px
--radius-sm: 8px
--glow:  rgba(0,210,255,0.2)
```

### Componentes CSS disponibles

| Clase | Uso |
|-------|-----|
| `.card` | Tarjeta base (bg2, border, border-radius 12px) |
| `.btn` | Botón genérico |
| `.btn-primary` | Botón primario azul |
| `.metric` | Tarjeta de métrica con número grande |
| `.metric-icon` | Icono decorativo flotante (abs, right, bottom, opacity .07) |
| `.pill` | Etiqueta/badge normal |
| `.pill-s` | Etiqueta pequeña |
| `.pill-i` | Etiqueta con icono |
| `.tag` | Tag compacto |
| `.form-group` | Grupo de formulario |
| `.form-label` | Label de formulario |
| `.prog-wrap` + `.prog-fill` | Barra de progreso horizontal |
| `.cal-day` | Celda de calendario con score |
| `.modal-overlay` + `.modal` | Modal centrado |
| `.score-ring-card` | Tarjeta con anillo SVG de score |
| `.ring-fill` | Arco SVG animado (stroke-dashoffset) |
| `.muscle-badge` | Badge de grupo muscular |
| `.muscle-push` | Badge pecho/empuje (rojo suave) |
| `.muscle-pull` | Badge espalda/tracción (cyan) |
| `.muscle-legs` | Badge piernas (ámbar) |
| `.muscle-core` | Badge core (morado) |
| `.muscle-cardio` | Badge cardio (verde) |

### Iconos
**Tabler Icons** — clase: `ti ti-{nombre}`
CDN: `https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css`

### Animaciones (portales de app)
```css
@keyframes cardIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
- Clase: `.card-anim`
- Staggered: 55ms entre elementos
- Requiere reflow (`void el.offsetWidth`) para reiniciar

---

## Páginas públicas (landing + auth)

### Fondo
- Color base: `#0c0c0c` (unificado con portales de app)
- Speed lines: `body::before` fixed, `background: repeating-linear-gradient(-52deg, ...)`, `z-index: 0`
  - Líneas primarias: `rgba(255,255,255,0.012)` cada 60px
  - Líneas secundarias: `rgba(255,255,255,0.007)` cada 140px
- Todo el contenido: `z-index: 1`

### Tipografía
- **Inter** — toda la app y páginas auth (desde `shared.css` @import Google Fonts)
- ~~Barlow Condensed~~ — reemplazado por Inter en rediseño junio 2026

### Logo
- `<img src="logo.png">` — PNG con transparencia RGBA
- Auth heroes (`login`, `register`, `invite`, `reset-password`): `width: 260-300px`
- Nav landing (`index.html`): `height: 48px`
- Header sticky portales app: `height: 26px`
- Siempre con `filter: drop-shadow(0 0 8px rgba(0,210,255,0.18))`

### Cards auth (glass morphism neutro)
```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(255,255,255,0.1);
border-top: 1px solid rgba(255,255,255,0.18);
border-radius: 16px;
backdrop-filter: blur(20px);
box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
```

### Botón primario auth
```css
.btn-login {
  background: white;
  color: #0c0c0c;
  border-radius: 9999px; /* pill */
  font-weight: 600;
}
.btn-login:hover { box-shadow: 0 0 24px rgba(255,255,255,0.15); }
```

### Header sticky (portales cliente y trainer mobile)
```css
position: sticky; top: 0; z-index: 50;
background: rgba(12,12,12,0.92);
backdrop-filter: blur(16px);
border-bottom: 1px solid rgba(255,255,255,0.07);
```

### Animaciones de entrada (auth)
Todas usan `cubic-bezier(.22, 1, .36, 1)`:
| Clase | Duración | Delay |
|-------|----------|-------|
| `logoIn` | 0.7s | 0s |
| `heroIn` (título) | 0.7s | 0.1s |
| `heroIn` (subtítulo) | 0.7s | 0.2s |
| `heroIn` (línea div.) | 0.7s | 0.3s |
| `cardIn` | 0.6s | 0.15s |

### Hero layout (auth pages)
```
[speed lines bg]
  [logo 300px + tagline]
  [línea divisoria cyan]
  [card formulario blur]
```

### Textos de marca por página
| Página | Tagline |
|--------|---------|
| `register.html` | "LA PLATAFORMA PARA PREPARADORES ÉLITE" |
| `invite.html` | "BIENVENIDO A TU PORTAL DE CLIENTE" |
| `login.html` | (sin tagline — logo lo incluye) |
| `reset-password.html` | (sin tagline — logo lo incluye) |

---

## Score ring SVG

```html
<svg class="score-ring" viewBox="0 0 120 120">
  <circle class="ring-bg" cx="60" cy="60" r="52"/>
  <circle class="ring-fill" id="ring-fill" cx="60" cy="60" r="52"/>
</svg>
```

```css
.ring-fill {
  fill: none;
  stroke: var(--blue);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 326.73;      /* 2π × 52 */
  stroke-dashoffset: 326.73;     /* inicio: vacío */
  transform-origin: 60px 60px;
  transform: rotate(-90deg);     /* empieza arriba */
  transition: stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1), stroke .5s;
}
```

Actualización desde JS:
```js
const circumference = 326.73
const offset = circumference * (1 - pct / 100)
fill.style.strokeDashoffset = offset
fill.style.stroke = pct >= 80 ? 'var(--green)'
                  : pct >= 50 ? 'var(--amber)'
                  : pct > 0   ? 'var(--red)'
                  :             'rgba(0,212,255,0.3)'
```

---

## Muscle group badges

```js
function getMuscleGroup(name) {
  const n = (name || '').toLowerCase()
  if (/press|pecho|pectoral|bench|push.?up|fondos|dip|apert|fly/.test(n))
    return { cls: 'muscle-push', icon: 'ti-arrows-horizontal', label: 'Pecho' }
  if (/hombro|deltoid|lateral|press.?militar|arnold/.test(n))
    return { cls: 'muscle-push', icon: 'ti-arrows-horizontal', label: 'Hombros' }
  if (/trícep|tricep|fondos|pushdown|skull/.test(n))
    return { cls: 'muscle-push', icon: 'ti-arrows-horizontal', label: 'Tríceps' }
  if (/espalda|dorsal|remo|jalón|pull|chin|dominad|bícep|bicep|curl/.test(n))
    return { cls: 'muscle-pull', icon: 'ti-arrows-horizontal', label: 'Espalda/Bíceps' }
  if (/pierna|sentadil|squat|leg|femoral|glút|glute|lunges|zancada|hip|rdl|peso muerto/.test(n))
    return { cls: 'muscle-legs', icon: 'ti-run', label: 'Piernas' }
  if (/gemelo|calf|soleo/.test(n))
    return { cls: 'muscle-legs', icon: 'ti-run', label: 'Gemelos' }
  if (/abdom|core|plancha|plank|crunch|oblicu/.test(n))
    return { cls: 'muscle-core', icon: 'ti-circle', label: 'Core' }
  if (/cardio|carrera|corr|bici|elípt|nadar|cuerda|hiit/.test(n))
    return { cls: 'muscle-cardio', icon: 'ti-heartbeat', label: 'Cardio' }
  return null
}
```
