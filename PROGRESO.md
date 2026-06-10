# Tu Preparador — Registro de Progreso del Proyecto

> **Proyecto:** Tu Preparador (tupreparador.es)
> **Stack:** Vanilla HTML/CSS/JS + Supabase + Vercel
> **Repositorio:** oalamanortiz-13/fitness-uri
> **Última actualización:** 10/06/2026

---

## Índice

1. [Estado actual de producción](#estado-actual)
2. [Historial de sesiones](#historial-de-sesiones)
3. [Funcionalidades completas](#funcionalidades-completas)
4. [Pendiente — acciones manuales](#pendiente--acciones-manuales)
5. [Pendiente — código](#pendiente--código)
6. [Análisis competitivo](#análisis-competitivo)
7. [Decisiones técnicas clave](#decisiones-técnicas-clave)

---

## Estado actual

| Elemento | Estado |
|----------|--------|
| Producción (Vercel) | ✅ Live en fitness-uri.vercel.app |
| Dominio propio | ⚠️ www.tupreparador.es (configurar DNS) |
| Supabase | ✅ cwwvwrzqlavuyqhyeepu |
| Stripe pagos | ⚠️ Implementado, secrets pendientes de activar |
| Push notifications | ⚠️ Implementado, secrets VAPID pendientes |
| IA editores | ✅ 5 editores (plan, dieta, cardio, supls, medidas) |
| Macros completos | ✅ Proteína + Carbohidratos + Grasas + Kcal |
| Panel trainer | ✅ Cargando correctamente (fix 10/06) |

### Usuarios en producción
| Email | Rol | Notas |
|-------|-----|-------|
| oalamanortiz@gmail.com | Admin | Cuenta principal |
| oalaman@icloud.com | Trainer | U BODY COACH — cuenta de testing, plan Studio activo hasta 2099 |
| ilovemusclenutrition@gmail.com | Trainer | I LOVE MUSCLE |
| info.estefaniapadron@gmail.com | Cliente | — |
| jaimeruiz@gmail.com | Cliente | — |
| marina@emedemarina.com | Cliente | — |

---

## Historial de sesiones

### Sesión inicial — Arquitectura base
**Qué se hizo:**
- Setup inicial del proyecto: schema SQL, tablas principales, RLS
- Portal del cliente (`client.html` + `client-app.js`) — mobile-first
- Portal del trainer (`trainer.html` + `trainer-app.js`) — desktop
- Sistema de autenticación con roles (admin / trainer / client)
- `requireRole()` / `redirectByRole()` / `logout()` en `auth.js`
- Tablas: `profiles`, `trainers`, `clients`, `workout_days`, `exercises`, `diet_meals`, `diet_foods`, `supplements`, `daily_logs`

---

### Sesión 23/05 — Funcionalidades avanzadas trainer
**Qué se hizo:**
- **Mi Perfil del trainer** — dashboard de negocio con métricas grandes:
  - Activos / Inactivos / Media 7 días / Sin registro hoy
  - Actividad diaria por cliente (barras de progreso)
  - Ranking semanal con barras de score coloreadas
  - Alerta de clientes sin registrar
  - Formulario colapsable editar perfil con botón "Descartar cambios"
- **Importación masiva de clientes** desde CSV o Excel (.xlsx):
  - Preview antes de importar
  - Barra de progreso durante la importación
  - Generación automática de contraseñas temporales
  - Descarga de archivo con credenciales
  - SheetJS cargado lazy desde CDN
- **Drag & drop** para reordenar comidas en pestaña Nutrición (handle ⠿, persiste `order_index`)
- **Instrucciones por sección** (Nutrición, Cardio, Suplementación):
  - Textarea + dictado por voz (Web Speech API, es-ES)
  - Guardado con feedback visual
  - Cliente ve instrucciones como caja azul al inicio de cada sección
- **Instrucciones por día** de entrenamiento — campo `notes` en `workout_days`
- `TRAINER_PROFILE_SNAPSHOT` para comparar cambios antes de guardar
- Constantes `SUPL_TIMINGS` y `CARDIO_TYPES` movidas a `js/constants.js` (módulo compartido)

---

### Sesión 25/05 — Editores IA + dictado por voz
**Qué se hizo:**
- **Editor IA de plan de entrenamiento** (`ai-plan-editor` Edge Function):
  - Trainer dicta en lenguaje natural → Gemini 2.5 Flash → acciones JSON
  - Acciones: `add_exercise`, `edit_exercise`, `remove_exercise`, `update_day`
  - Retry exponencial 3s/8s/15s en errores 429/5xx
  - Fallback automático a Claude Haiku si Gemini falla
- **Editor IA de dieta** (`ai-diet-editor`): mismo patrón
- **Editor IA de cardio** (`ai-cardio-editor`): mismo patrón
- **Editor IA de suplementos** (`ai-supls-editor`): mismo patrón
- **Editor IA de medidas** (`ai-measures-editor`): mismo patrón
- **Chat IA cliente** movido a Edge Function proxy `ai-chat` (API key ya no expuesta en cliente)
- `startVoice(targetId, btn)` — toggle: 1er click inicia SpeechRecognition, 2º click para

**Arquitectura callWithFallback:**
```typescript
async function callWithFallback(prompt, maxTokens) {
  try { return await callGemini(prompt, maxTokens) }
  catch (e) {
    try { return await callClaude(prompt, maxTokens) }
    catch (e2) { throw e }
  }
}
```

---

### Sesión 02/06 — Rediseño páginas públicas
**Qué se hizo:**
- **Logo oficial** `Logopreparador.png` integrado en todas las páginas públicas (300px en auth heroes, 56px en nav landing)
- **Speed lines background** en todas las páginas públicas (`body::before`, -52deg, fondo #0A0F1E)
- **Landing page** (`index.html`) — hero, features, how-it-works, pricing, CTA, footer
- **Login** (`login.html`) — hero con logo, recuperación de contraseña inline
- **Registro** (`register.html`) — hero con tagline "LA PLATAFORMA PARA PREPARADORES ÉLITE"
- **Reset password** (`reset-password.html`) — rediseño visual
- **Invitación cliente** (`invite.html`) — hero "BIENVENIDO A TU PORTAL DE CLIENTE"
- Animaciones staggered: `logoIn`, `heroIn`, `cardIn` — cubic-bezier(.22,1,.36,1)
- Card formulario con `backdrop-filter:blur(20px)`, border-top cyan 2px

---

### Sesión 09/06 — PWA + Push Notifications + Seguridad
**Qué se hizo:**
- **Iconos PWA**: `apple-touch-icon.png` (180×180) e `icon-512.png` (512×512) generados con Pillow
- **manifest.json** en raíz; `<link rel="manifest">` en `client.html` y `trainer.html`
- **Service Worker** (`sw.js`) registrado desde `client-app.js`
- **Push notifications** implementadas end-to-end:
  - Tabla `push_subscriptions` (migración 011)
  - Edge Function `send-push/index.ts`: VAPID JWT manual + AES-GCM (sin deps)
  - Banner de activación en dashboard cliente
  - App Badging API para badge en icono PWA
  - `sendPushToClient(clientId, title, body)` en trainer-app.js
- **Seguridad** — deduplicación de constantes, secrets movidos a Edge Functions
- **Tab buttons** rediseño visual en `shared.css`:
  - Normal: `background:rgba(255,255,255,0.18)`, border semitransparente
  - Activo: `background:var(--blue)`, glow azul
- **Resiliencia ai-onboarding**: retry exponencial 5s→12s→25s, mensajes de error en español
- **Templates de email** con branding Tu Preparador (mobile-responsive)
- **Fix overflow-x** en móvil

---

### Sesión 10/06 — Stripe tiers + Auto-confirm + Activación trainers
**Qué se hizo:**
- **Modelo Stripe migrado** de €9,90/cliente a tiers planos:
  | Tier | Mensual | Anual |
  |------|---------|-------|
  | Starter | €29 | €24 |
  | Pro | €59 | €49 |
  | Elite | €99 | €82 |
  | Studio | €149 | a medida |
- **Migración `013_plan_tier`**: columna `plan_tier` en `trainers`
- **`create-checkout-session`** v17: acepta `tier`, resuelve price_id via secrets
- **`stripe-webhook`** v20: guarda `plan_tier` en `trainers`
- **Migración `014_auto_confirm_email`**: trigger DB que auto-confirma emails al registrarse
- **Campo ICP** en `register.html` (rango de clientes: 0 / 1-5 / 6-15 / 16-30 / 30+)
- **Pantalla de bienvenida** para trainers sin clientes — wizard 3 pasos con CTA
- **Auto-carga Mi Perfil** al login cuando hay clientes existentes
- **Pricing 4 tiers** en landing page con toggle mensual/anual
- **Auto sign-in** post-registro en `register.html` y `solo-register.html`
- **UX fixes**: saludo chat con nombre del cliente, scores en tab Progreso

---

### Sesión 10/06 (tarde) — Macros completos + Fix crítico
**Qué se hizo:**

#### Macros completos en nutrición
- **Migración `015_macros`**: nuevas columnas en BD
  ```sql
  ALTER TABLE diet_foods ADD COLUMN IF NOT EXISTS carbs_g INT DEFAULT 0;
  ALTER TABLE diet_foods ADD COLUMN IF NOT EXISTS fat_g INT DEFAULT 0;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS carbs_goal INT DEFAULT 0;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS fat_goal INT DEFAULT 0;
  ```
- **`trainer.html`**: modal de alimento con grid 2×2 (Proteína / Carbohidratos / Grasas / Kcal)
- **`trainer.html`**: modal nuevo cliente con campos `nc-carbs` y `nc-fat`
- **`trainer-app.js`**: `renderFoodRow()` muestra `25g P · 40g C · 8g G · 330 kcal`
- **`trainer-app.js`**: `saveProfile()` y `createClient()` incluyen `carbs_goal`, `fat_goal`
- **`client.html`**: tarjetas opcionales de carbohidratos y grasas (visibles cuando goal > 0)
- **`client.html`**: 4 barras de progreso en meal-summary-card
- **`client-app.js`**: `updateMealTotals()` calcula los 4 macros
- **`client-app.js`**: `applyClientConfig()` muestra tarjetas carbs/fat solo si goals > 0
- **`ai-diet-editor`**: prompt actualizado para incluir `carbs_g` y `fat_g` en todas las acciones

#### Fix crítico — Panel trainer no cargaba
- **Bug**: `trainer-app.js` importaba `CARDIO_TYPE_META` de `constants.js`, pero ese nombre no existe (se exporta como `CARDIO_TYPE_BY_ID`)
- **Efecto**: En ES modules nativos del navegador, un named import inexistente lanza `SyntaxError` e impide cargar todo el módulo → panel completamente en blanco
- **Fix**: eliminado el import sin uso (`CARDIO_TYPE_META` no se usaba en ninguna parte del archivo)

---

## Funcionalidades completas

### Portal Cliente (client.html)
- [x] Dashboard con perfil: foto, nombre, logo trainer, etiqueta objetivo
- [x] Upload de avatar con preview instantáneo
- [x] Plan de entrenamiento — ejercicios con series/reps, registro de cargas
- [x] Plan de dieta — comidas agrupadas, check de alimentos, macros completos (P/C/G/Kcal)
- [x] Alimentos extra añadibles por el cliente
- [x] Plan de cardio — tipos con iconos, pasos, minutos, progreso
- [x] Suplementos agrupados por horario (mañana/tarde/noche/pre/post)
- [x] Sistema de puntuación diaria (Entreno 40% + Nutrición 40% + Cardio 20%)
- [x] Botón "Completado" one-per-day en cada sección (con modal de resumen)
- [x] Calendario mensual con % coloreado (verde ≥80%, ámbar ≥50%, rojo <50%)
- [x] Instrucciones del trainer por sección (caja azul)
- [x] Instrucciones por día de entrenamiento
- [x] Recordatorio anti-sedentarismo configurable
- [x] Chat IA con el preparador
- [x] Push notifications (VAPID secrets pendientes de activar)
- [x] PWA — instalable en iOS/Android desde navegador

### Portal Trainer (trainer.html)
- [x] Sidebar: logo clickable (upload), nombre, lista de clientes con avatar y último log
- [x] Filtros de clientes (todos/activos/inactivos + por etiqueta)
- [x] **Mi Perfil** — dashboard de negocio: métricas, actividad diaria, ranking semanal
- [x] Tab **Perfil**: datos del cliente, objetivos con macros completos, reglas de oro
- [x] Tab **Entreno**: días, ejercicios, editor IA por voz, instrucciones por día
- [x] Tab **Nutrición**: comidas con drag & drop, alimentos con macros, editor IA, instrucciones
- [x] Tab **Cardio**: objetivos pasos/cardio, tipos de cardio, gráfica barras, historial, editor IA
- [x] Tab **Supls**: suplementos con horario y color, editor IA
- [x] Tab **Medidas**: formulario corporal completo (12 campos), historial con deltas, editor IA
- [x] Tab **Progreso**: scores, gráficas Chart.js, evolución de peso
- [x] Importación masiva CSV/Excel con preview y descarga de credenciales
- [x] Envío de resumen y mensajes al cliente (push notification)
- [x] Modelo Stripe 4 tiers con paywall por límite de clientes

### Backend / Infraestructura
- [x] 15 migraciones SQL aplicadas en producción
- [x] 8 Edge Functions desplegadas en Supabase:
  - `ai-plan-editor`, `ai-diet-editor`, `ai-cardio-editor`, `ai-supls-editor`, `ai-measures-editor`
  - `ai-chat`, `ai-onboarding`
  - `create-checkout-session`, `stripe-webhook`
  - `send-push`
- [x] RLS completo en todas las tablas
- [x] Auto-confirmación de emails via trigger DB
- [x] Storage bucket `avatars` con avatares de clientes y logos de trainers
- [x] Gemini 2.5 Flash como LLM principal + Claude Haiku como fallback automático

---

## Pendiente — Acciones manuales
*(Requieren acceso al panel de Supabase/Stripe desde desktop)*

### Stripe (alta prioridad para monetización)
- [ ] Añadir secrets en Supabase Dashboard → Edge Functions → Secrets:
  - `STRIPE_SECRET_KEY` — clave secreta de Stripe (live)
  - `STRIPE_PRICE_STARTER` — price_id del tier Starter en Stripe live
  - `STRIPE_PRICE_PRO` — price_id del tier Pro
  - `STRIPE_PRICE_ELITE` — price_id del tier Elite
  - `STRIPE_PRICE_STUDIO` — price_id del tier Studio
  - `STRIPE_WEBHOOK_SECRET` — whsec_... del webhook en Stripe dashboard
  - `APP_URL` — https://www.tupreparador.es
- [ ] Crear webhook en Stripe Dashboard:
  - Endpoint: `https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/stripe-webhook`
  - Eventos: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

### Push Notifications
- [ ] Generar VAPID keys: `npx web-push generate-vapid-keys`
- [ ] Añadir secrets en Supabase:
  - `VAPID_PRIVATE_KEY`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_SUBJECT` → `mailto:oalamanortiz@gmail.com`
- [ ] Actualizar `VAPID_PUBLIC_KEY` en `client-app.js` con la clave pública generada

### DNS / Dominio
- [ ] Configurar DNS de tupreparador.es → Vercel
- [ ] Verificar que Vercel tiene el dominio añadido al proyecto

---

## Pendiente — Código

### Verificación pendiente
- [ ] Confirmar que `ai-chat` en `client-app.js` apunta a la Edge Function (no a la API de Anthropic directamente)

### Mejoras identificadas (análisis competitivo)
- [ ] **Sincronización Apple Health / Google Fit** — conteo automático de pasos (brecha vs Harbiz)
- [ ] **Sistema de hábitos y rachas** — streak diario visible en dashboard cliente
- [ ] **Biblioteca de videos de ejercicios** — enlace a video por ejercicio (YouTube o propio)
- [ ] **Agenda y reserva de citas** — trainer fija horarios disponibles, cliente reserva
- [ ] **TWA para Android** (app en Play Store sin coste de desarrollo nativo)
- [ ] **Modo offline** en service worker — cachear plan del día para uso sin conexión

---

## Análisis competitivo

*(Realizado en sesión 10/06)*

### Plataformas analizadas
Harbiz, Trainerize, My PT Hub, TrueCoach, Hexfit, Everfit, PTminder

### Lo que tienen ellos y nosotros no (gaps)
| Feature | Prioridad |
|---------|-----------|
| Sincronización wearables (Apple Health, Garmin, Fitbit) | Alta |
| App nativa en App Store / Play Store | Alta |
| Sistema de hábitos / rachas diarias | Media |
| Biblioteca de ejercicios con vídeos | Media |
| Agenda y reserva de citas integrada | Media |
| Portal para que el cliente pague al trainer | Baja |
| Comunidad / foro entre clientes | Baja |

### Nuestro valor diferencial (lo que ellos no tienen bien)
| Ventaja | Descripción |
|---------|-------------|
| **IA en cada sección** | Gemini 2.5 Flash edita plan, dieta, cardio, supls y medidas por instrucción de voz — ninguna app del mercado tiene esto integrado así |
| **Dictado por voz nativo** | Instrucciones por voz sin app adicional, funciona en iOS Safari |
| **Onboarding IA** | Plan completo generado automáticamente desde los datos del cliente |
| **Precio muy competitivo** | €29 Starter vs €60-130/mes de competidores para funcionalidades equivalentes |
| **PWA sin app store** | Instalable desde navegador, sin fricción de descarga |
| **Multi-trainer con RLS** | Arquitectura sólida multi-tenant desde el inicio |

---

## Decisiones técnicas clave

### Stack elegido
**Vanilla JS + Supabase + Vercel** en lugar de React/Next.js.
- Ventaja: zero build step, deploys instantáneos, sin dependencias que actualizar
- Desventaja: componentes reutilizables más verbosos, no hay SSR

### LLMs — Gemini principal + Claude fallback
- Gemini 2.5 Flash: más barato, contexto largo, JSON nativo
- Claude Haiku: fallback automático si Gemini falla (sin intervención manual)
- API keys guardadas en Supabase secrets, nunca expuestas al cliente

### Supabase RLS como capa de seguridad principal
- Cada tabla tiene políticas que garantizan que trainer solo ve sus clientes y cliente solo ve su fila
- No hay lógica de autorización en el frontend — el backend la enforce

### Migraciones en producción
- Carpeta `supabase/migrations/` como registro histórico
- Se aplican via MCP de Supabase directamente a producción
- Siempre `ADD COLUMN IF NOT EXISTS` para idempotencia

### Puntuación diaria
- Entrenamiento 40% + Nutrición 40% + Cardio 20%
- Cada componente se guarda independientemente con `saveScoreComponent(field, value)`
- Total recalculado en cada save, preservando los otros componentes desde `S.calScores[today]`

---

*Documento generado el 10/06/2026. Para mantenerlo actualizado, actualizar tras cada sesión de desarrollo.*
