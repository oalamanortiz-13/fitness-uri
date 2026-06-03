# Log de sesiones de desarrollo

Registro cronológico de todas las sesiones de trabajo en el proyecto fitness-uri / Tu Preparador.

---

## Sesiones tempranas (antes de mayo 2025)

### Setup inicial
- Repositorio creado: `oalamanortiz-13/fitness-uri`
- Stack elegido: Vanilla HTML/CSS/JS + Supabase + Vercel
- Schema inicial de Supabase (profiles, trainers, clients, workout_days, diet_plans, supplements, daily_logs)
- Migración `001_trainer_self_register` — auto-registro trainers
- Migración `002_invitations` — invitaciones a clientes
- Migración `003_subscription_columns` — columnas Stripe

---

## Sesión (aprox. mayo 2025)

### Funcionalidades de auth
- Sistema de invitación con magic link + compartir por WhatsApp
- Páginas auth funcionales: login, register, reset-password, invite
- `requireRole()` y `redirectByRole()` en auth.js
- Fix: modal de invitación no aparecía (faltaba clase `.open`)

### UI/UX inicial
- Barlow (Google Fonts), skeleton loading, mejoras touch UX
- Design system navy/cyan inicial con Rajdhani (luego reemplazado)

---

## Sesión 23/05/2025

### Arquitectura de datos avanzada
- Migración `004_avatar_logo_columns` — avatar_url, logo_url, goal_label, bucket avatars
- Sistema de puntuación diaria (entrenamiento 40% + nutrición 40% + cardio 20%)
- Botones "Finalizar" one-per-day en entreno, nutrición y cardio
- Calendario mensual con % coloreado (verde/ámbar/rojo)

### Trainer portal — funcionalidades
- Pestaña Cardio: objetivos pasos/cardio, gráfica barras, historial
- Pestaña Medidas: formulario corporal, deltas vs anterior, historial
- Mi Perfil: dashboard de negocio con métricas grandes
- Drag & drop de comidas (HTML5 nativo, handle ⠿, persiste order_index)
- Upload de logo trainer (sidebar 72px)
- Import masivo CSV/Excel con preview, progress bar, credenciales

### Notas de arquitectura
- `SUPL_TIMINGS` y `CARDIO_TYPES` duplicados en trainer-app.js y client-app.js
- Drag & drop activado solo desde `.drag-handle` vía mousedown
- Snapshot `TRAINER_PROFILE_SNAPSHOT` para descartar cambios en Mi Perfil

---

## Sesión 25/05/2025

### IA y dictado por voz
- `notesCard()` helper — textarea + mic + guardar por sección
- `startVoice()` — SpeechRecognition continuous, es-ES, toggle
- Instrucciones por sección (Nutrición, Cardio, Suplementación)
- Instrucciones por día de entrenamiento (`notes` en workout_days)
- Editor de plan con IA: Edge Function `ai-plan-editor` → Gemini 2.0 Flash
  - Acciones: add_exercise, edit_exercise, remove_exercise, update_day
  - `applyAIPlanActions()` aplica cambios al plan en tiempo real

### Migraciones
- `009_section_notes` — notes_workout/diet/cardio/supls en clients
- `010_workout_day_notes` — notes en workout_days

---

## Sesión 02/06/2025

### Rediseño brand completo — páginas públicas
- Logo oficial `Logopreparador.png` (PNG RGBA transparente)
- Landing page (`index.html`) — hero, features, how-it-works, pricing, CTA, footer
- Speed lines background: body::before fixed -52deg
- Auth pages rediseñadas: hero layout con logo 300px, animaciones staggered
- Barlow Condensed (headings) + Barlow (body) desde Google Fonts
- login.html y reset-password.html eliminaron brand-name (ya en logo)

### Merge conflict resuelto
- `git checkout --ours css/shared.css index.html`
- Mantener diseño más completo de main

---

## Sesión (junio 2025 — continuación)

### Rediseño visual portales de app
- **Request:** Dark navy + electric cyan professional fitness design
- CSS reescrito: nuevos tokens, glass-morphism en tarjetas, glow en métricas
- Score ring SVG animado (stroke-dashoffset, circunferencia 326.73)
- Animaciones staggered cardIn en cambio de sección
- Muscle group badges (push/pull/legs/core/cardio) por regex en nombre del ejercicio
- Iconos decorativos en métricas (52px, opacity 0.07)

### Fix crítico — página cliente no cargaba
- **Error:** `Identifier 'today' has already been declared`
- **Causa:** `const today` declarado dos veces en `loadTodayLog()` (mismo scope)
- **Diagnóstico:** Node.js syntax check (`new Function()`)
- **Fix:** Eliminar declaración duplicada

### Navegación swipe
- **Request:** scroll D→I para navegar entre secciones en móvil
- Implementado en client-app.js al final del archivo:
  ```js
  const SECTIONS = ['dash', 'train', 'nutri', 'cardio', 'prog', 'cal', 'ai']
  // touchstart + touchend: threshold 40px, 400ms, ratio horizontal > vertical
  ```
- Passive listeners para no bloquear scroll vertical

### Fotos de progreso
- **Request:** las fotos de progreso no se guardaban
- **Storage:** bucket `avatars`, path `progress-{USER_ID}-{slot}.{ext}`
- `handlePhoto()` — FileReader preview → remove todas extensiones → upload upsert
- `loadProgressPhotos()` — HEAD fetch para verificar existencia antes de mostrar

### % grasa corporal persistente
- **Request:** guardar el % de grasa también
- **Migración 012:** `ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS body_fat_pct NUMERIC(4,1)`
- `saveLog()` lee slider `#bf-sl` → guarda como `body_fat_pct`
- `loadTodayLog()` restaura valor del slider desde `log.body_fat_pct`
- Slider: `step="0.5"`, `oninput="...;scheduleSave()"`

---

## Sesión 03/06/2026

### Rediseño completo portal preparador — layout 3 columnas
- **Request:** replicar mockup de interfaz con 3 columnas: nav-sidebar + client-panel + main
- Layout desktop: `nav-sidebar` 196px fijo + `client-panel` 288px + `main` flex:1
- Nav sidebar con Tabler icons: Panel, Clientes, Activos, Sin registro, Archivados
- Filas de cliente (`.cr`) con avatar hash-color, status text, barra de score
- Panel derecho: "Resumen del día" con `cia-card`, `ai-card`, `msg-body`, `attach-pill`
- `buildDayResumen(client, log)` — genera texto automático del resumen diario
- `TODAY_LOGS` — carga bulk de daily_logs de todos los clientes al startup
- `avatarColor()` / `labelColor()` — color hash desde string

### Mobile trainer portal
- Header sticky: logo (72px) + botones Nuevo/Mi perfil/Salir
- Nav horizontal scrollable con tabs: Panel/Clientes/Activos/Sin registro/Archivados
- CSS: `body.mobile-detail` toggle para mostrar solo un panel a la vez
- `mobileBackToList()` — botón back en detail view
- `openMyProfile()` activa `mobile-detail` + oculta search en mobile

### Fix: buscador mobile desaparece al entrar en cliente
- `body.mobile-detail #mobile-search{ display:none !important }` en CSS
- También oculto desde JS en `selectClient()` y `openMyProfile()`

### Rediseño portal cliente — mismo design language que trainer
- **Request:** portal cliente con mismo estilo visual que portal trainer
- `theme-color` cambiado `#03045E` → `#0c0c0c`
- **Header sticky nuevo** (`#client-header`): logo 26px + phase pill + botón Salir
  - `display:none` hasta que el JS lo muestra tras login exitoso
- **Speed lines** background: `body::before` igual que trainer y auth pages
- **Tarjeta de perfil** (`#client-profile-card`): glass morphism neutro
  - Eliminado gradiente `linear-gradient(135deg,#020236,#03045E)`
  - Reemplazado: `rgba(255,255,255,0.04)` + `border-top: rgba(255,255,255,0.16)` + `backdrop-filter:blur(20px)`
- Avatar ring: borde `rgba(255,255,255,0.18)` en vez de `2px solid var(--blue)`
- Logo trainer box: borde `rgba(255,255,255,0.1)` neutro
- Phase pill: aparece en header sticky + dashboard intro (IDs: `phase-label`, `phase-label-dash`)
- `client-app.js` actualizado: muestra `#client-header` y `#header-phase` al cargar, escribe fase en ambos IDs

### Landing page — logo en header
- Reemplazado SVG placeholder genérico por `<img src="logo.png">` en `<nav>`
- Tamaño: 32px → 48px (ajustado a petición del usuario)
- `filter: drop-shadow(0 0 8px rgba(0,210,255,0.18))` para coherencia visual

---

## Estado actual (03/06/2026 — fin de sesión)

### Commits recientes en main
```
bc0f145 Logo nav landing: 32px → 48px
f543518 Reemplazar SVG placeholder por logo.png en nav de la landing
726c134 Rediseño portal cliente: glass morphism, header sticky, speed lines
308ecf4 Hide mobile search bar when client detail is open
f277ea5 fix: Panel button on mobile now shows Mi Perfil dashboard
928c89a feat: mobile layout with sticky header + nav tabs
20adfe1 fix: mobile layout — one panel at a time with back navigation
4855750 feat: exact mockup replication — Resumen del día + refined 3-col nav
c595c4b feat: 3-column trainer portal layout matching mockup design
f8a2a80 merge: apply Inter/dark-glass redesign to all app pages
```

### Branch activa de desarrollo
`claude/vibrant-franklin-tBzIG` (alineada con main)

### Design language unificado — estado final
Todos los portales y páginas comparten ahora el mismo sistema:
- Fondo: `#0c0c0c` + speed lines `body::before` (-52deg)
- Tipografía: Inter via `shared.css`
- Cards: glass morphism `rgba(255,255,255,0.04)` + `blur`
- Bordes: `rgba(255,255,255,0.08)` neutro, top `rgba(255,255,255,0.16)`
- Botón primario: `background:white; color:#0c0c0c` (pill) en auth / `var(--blue)` en app
- Logo: `logo.png` en todos los headers

### Próximos pasos
1. Activar Stripe (añadir secrets en Supabase Edge Functions)
2. Mover API key de Anthropic a Edge Function proxy
3. Verificar editor IA de plan con Gemini (debug campo `debug`)
4. Desactivar confirmación de email en Supabase Auth
5. Revisar UX portal cliente en dispositivos reales con el nuevo header
