# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto
**Tu Preparador** — plataforma multi-tenant de fitness para preparadores físicos y sus clientes.
- **Nombre:** Tu Preparador
- **Dominio:** www.tupreparador.es
- **URL producción (temporal):** fitness-uri.vercel.app
- **Supabase proyecto:** cwwvwrzqlavuyqhyeepu
- **Stack:** Vanilla HTML/CSS/JS + Supabase (Auth + PostgreSQL) + Vercel (estático)
- **Deploy:** push a `main` → Vercel despliega automáticamente. Desarrollar en `claude/vigilant-noether-VWGx9`, mergear a `main` para ver cambios en producción.

## Estructura de archivos
```
fitness-uri/
├── index.html              # Login + recuperación de contraseña (vista inline)
├── reset-password.html     # Nueva contraseña tras link de email
├── client.html             # Portal del cliente (mobile-first, max-width 480px)
├── trainer.html            # Portal del preparador (desktop, max-width 900px, sidebar + main)
├── admin.html              # Panel admin
├── css/shared.css          # Design system completo — NO tocar sin revisar qué usa
├── js/
│   ├── supabase-client.js  # Init Supabase (credenciales ya configuradas)
│   ├── auth.js             # requireRole(), redirectByRole(), logout()
│   ├── client-app.js       # ~1300 líneas — lógica portal cliente
│   ├── trainer-app.js      # Lógica portal trainer + suscripción Stripe
│   └── admin-app.js        # Lógica panel admin
└── supabase/
    ├── schema.sql          # Schema original (referencia)
    ├── migrations/         # Migraciones ejecutadas en producción
    └── functions/
        ├── create-checkout-session/   # Edge Function Stripe Checkout (desplegada)
        ├── stripe-webhook/            # Edge Function webhook Stripe (desplegada)
        ├── bulk-import-clients/       # Importación masiva via Admin API (sin rate limit)
        ├── generate-invite-link/      # Genera magic link para invitar cliente (verify_jwt:true)
        ├── ai-plan-editor/            # Groq Llama 3.3 70B — edita plan de entreno (acciones JSON)
        ├── ai-diet-editor/            # Groq — edita plan de nutrición
        ├── ai-cardio-editor/          # Groq — edita objetivos de cardio
        ├── ai-supls-editor/           # Groq — edita suplementos
        ├── ai-measures-editor/        # Groq — extrae medidas corporales de texto natural
        └── ai-chat/                   # Groq Llama 3.1 8B — chat IA para portal cliente
```

## Roles y acceso
| Rol | Portal | Puede hacer |
|-----|--------|-------------|
| admin | admin.html | Crear trainers, ver stats globales |
| trainer | trainer.html | Crear/gestionar clientes, asignar planes |
| client | client.html | Ver su plan, registrar progreso diario |

Cada portal llama a `requireRole('rol')` al inicio. Si la sesión no coincide redirige al portal correcto.

## Supabase — tablas y columnas relevantes

### `profiles`
`id` (= auth.uid), `role` (admin/trainer/client), `full_name`, `email`

### `trainers`
`id`, `bio`, `specialty`, `max_clients`, `logo_url`, `subscription_status`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`

### `clients`
`id`, `trainer_id`, `age`, `height_cm`, `weight_start`, `weight_goal`, `kcal_goal`, `protein_goal`, `steps_goal`, `cardio_goal_min`, `plan_start_date`, `plan_weeks`, `phase_name`, `notes`, `golden_rules` (TEXT[]), `active`, `avatar_url`, `goal_label`, `reminder_interval_min`

### `daily_logs`
`client_id`, `log_date`, `steps`, `cardio_min`, `weight_kg`, `rpe`, `checklist` (JSONB), `exercises_done` (UUID[]), `loads` (JSONB: `{exId: [kg_s1, kg_s2, ...]}`), `foods_checked` (UUID[]), `calendar_status` (done/miss), `score`, `score_training`, `score_nutrition`, `score_cardio`

### `body_measurements`
`id` (UUID PK), `client_id` (UUID FK), `measured_at` (DATE), `weight_kg`, `body_fat_pct`, `waist_cm`, `hips_cm`, `chest_cm`, `shoulder_cm`, `arm_r_cm`, `arm_l_cm`, `thigh_r_cm`, `thigh_l_cm`, `calf_r_cm`, `calf_l_cm`, `notes`, `created_at`
- RLS: trainer lee/escribe medidas de sus clientes; cliente lee/escribe las suyas

### Storage
- Bucket `avatars` (público): `client-{USER_ID}` para avatares de clientes (sin extensión, siempre sobreescribe), `trainer-{TRAINER_ID}.ext` para logos de trainers

### RLS crítico
- `clients`: trainer lee/escribe sus propios clientes; cliente hace SELECT y UPDATE de su propia fila (`id = auth.uid()`)
- `trainers`: trainer hace SELECT/UPDATE de su propia fila; cliente hace SELECT del trainer asignado (`id IN (SELECT trainer_id FROM clients WHERE id = auth.uid())`)
- `profiles`: trainer lee perfiles de sus clientes; cliente lee el suyo

## Arquitectura client-app.js

Estado global en objeto `S` (línea ~23). Funciones clave:
- `loadClientData()` — carga CLIENT, TRAINER_PROFILE, WORKOUT_DAYS, DIET_PLAN, SUPPLEMENTS
- `loadTodayLog()` — carga estado del día actual en S (pasos, cargas, foodsChecked, flags done; `trainingDone`, `nutDone`, `cardioDone`)
- `loadWeekCardio()` / `loadMonthLogs()` — datos de calendario y scores
- `saveLog()` — upsert debounced de daily_logs (scheduleSave() lo llama con 2s delay)
- `saveScoreComponent(field, value)` — guarda score parcial y recalcula total; field = 'training'|'nutrition'|'cardio'. Preserva los otros componentes desde `S.calScores[today]`
- `finishWorkout()` / `finishNutrition()` / `finishCardio()` — botones de completado one-per-day, muestran modal con resumen de puntuación
- `finishModal({emoji, title, subtitle, scorePct, scoreColor, extraRows})` — modal compartido de resultado
- `updateNutriFinishBtn()` / `updateCardioFinishBtn()` — actualizan estado/color del botón en tiempo real
- `renderWorkout(dayIdx)` — renderiza ejercicios + botón finalizar
- `applyClientConfig()` — aplica todos los datos CLIENT al DOM (incluye `setSedInterval`)
- `applyClientProfile(myProfile)` — nombre, avatar (con cache-bust `?t=Date.now()`), logo trainer, tags objetivo
- `uploadAvatar(e)` — FileReader preview instantáneo → upload a `client-{USER_ID}` en Storage → update clients.avatar_url
- `setSedInterval(min)` / `startSedTimer()` / `resetSedTimer()` — recordatorio anti-sedentarismo configurable

`loads` en daily_logs usa formato JSONB `{exId: [kg_s1, kg_s2, kg_s3]}`. La función `getSetLoads()` tiene compatibilidad hacia atrás con el formato antiguo `{exId: "45"}`.

## Sistema de puntuación diaria
- Entrenamiento 40%: ejercicios completados / total
- Nutrición 40%: alimentos del plan marcados / total
- Cardio 20%: pasos (60%) + minutos cardio (40%) vs objetivos
- Score total se recalcula al guardar cualquier componente, conservando los demás en `S.calScores`
- Calendario muestra el % bajo el número de día, coloreado: verde ≥80%, ámbar ≥50%, rojo <50%

## Trainer portal (trainer-app.js)

Layout: sidebar fijo (260px) + main scrollable. En mobile se apila verticalmente.

Flujo principal:
1. `loadClients()` → `renderClientList()` → click → `selectClient(id)`
2. `loadClientFullData(id)` carga workouts, dieta, suplementos, logs
3. **Tabs: Perfil / Entreno / Nutrición / Cardio / Supls / Medidas / Progreso** → cada uno tiene `render*Tab()`
   - Los botones de tab usan `data-tab="..."` para detección fiable del activo: `b.dataset.tab === tab`
4. `saveProfile()` actualiza tabla `clients` con todos los campos del formulario
5. `renderCardioTab()` — objetivos pasos/cardio, selector reminder, gráfica de barras pasos (verde=alcanzado), historial cardio
6. `saveCardioConfig()` — guarda `steps_goal`, `cardio_goal_min`, `reminder_interval_min` en clients
7. `renderMeasuresTab()` — formulario de medidas corporales, tarjeta última medición con deltas vs anterior, historial completo
8. `saveMeasurement()` — inserta en `body_measurements`; orden de campos: hombros, pecho, brazos D/I, cintura, cadera, muslos D/I, gemelos D/I
9. `deleteMeasurement(id)` — borra fila de body_measurements
10. `loadTrainerLogo()` / `applyTrainerLogo(url)` / `uploadTrainerLogo(e)` — logo del trainer en sidebar (72px), sube a `trainer-{ID}.ext` en bucket avatars

Sidebar superior: logo 72px (clickable para subir imagen, camera overlay), nombre del trainer en `#trainer-name-logo`.

## Modelo de negocio Stripe (implementado, pendiente activar)
- €9,90 por cliente activo / mes, trial 14 días
- Edge Functions desplegadas: `create-checkout-session`, `stripe-webhook`
- Variables de entorno pendientes en Supabase: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`

## Design system
```css
--bg: #0f0f0f   --bg2: #1a1a1a   --bg3: #242424
--blue: #378ADD  --green: #1D9E75  --amber: #BA7517  --red: #E24B4A
```
Componentes: `.card`, `.btn`, `.btn-primary`, `.metric`, `.pill`, `.pill-s`, `.pill-i`, `.tag`, `.form-group`, `.form-label`, `.prog-wrap` + `.prog-fill`, `.cal-day`, `.modal-overlay` + `.modal`
Iconos: Tabler Icons (`ti ti-*`)

## Usuarios en producción
- **Admin:** oalamanortiz@gmail.com
- **Trainer U BODY COACH:** oalaman@icloud.com (ID: `53ef0bfc-df61-4904-8a4e-fb24b3040874`)
- **Trainer I LOVE MUSCLE:** ilovemusclenutrition@gmail.com
- **Clientes:** info.estefaniapadron@gmail.com, jaimeruiz@gmail.com, marina@emedemarina.com

## SQL útil
```sql
-- Ver usuarios y roles
SELECT p.full_name, p.email, p.role, c.trainer_id
FROM profiles p LEFT JOIN clients c ON c.id = p.id;

-- Confirmar emails pendientes
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Estado suscripciones trainers
SELECT t.id, p.full_name, t.subscription_status, t.trial_ends_at
FROM trainers t JOIN profiles p ON p.id = t.id;

-- Ver scores del mes
SELECT log_date, score, score_training, score_nutrition, score_cardio
FROM daily_logs WHERE client_id = '<uuid>' ORDER BY log_date DESC LIMIT 30;

-- Ver medidas de un cliente
SELECT measured_at, weight_kg, body_fat_pct, shoulder_cm, chest_cm,
  arm_r_cm, arm_l_cm, waist_cm, hips_cm, thigh_r_cm, thigh_l_cm, calf_r_cm, calf_l_cm
FROM body_measurements WHERE client_id = '<uuid>' ORDER BY measured_at DESC;
```

## Migraciones aplicadas en producción
- `004_avatar_logo_columns` — `avatar_url` en clients, `logo_url` en trainers, `goal_label` en clients, bucket `avatars`
- `005_body_measurements` — tabla `body_measurements` con RLS
- `006_measurements_split_fields` — `shoulder_cm`, `arm_r_cm`, `arm_l_cm`, `thigh_r_cm`, `thigh_l_cm`, `calf_r_cm`, `calf_l_cm`
- `007_cardio_types` — `cardio_types TEXT[]` en clients
- `008_supplement_timing` — `timing TEXT` en supplements
- `009_section_notes` — `notes_workout`, `notes_diet`, `notes_cardio`, `notes_supls TEXT` en clients
- `010_workout_day_notes` — `notes TEXT` en workout_days (instrucciones por día visibles en cliente)

## Funcionalidades implementadas (producción)
- [x] Sistema de puntuación diaria (entrenamiento 40% + nutrición 40% + cardio 20%)
- [x] Botón "completado" en entrenamiento, nutrición y cardio (one-per-day)
- [x] Calendario mensual con % coloreado (verde ≥80%, ámbar ≥50%, rojo <50%)
- [x] Perfil de cliente en dashboard (foto, nombre, logo trainer, etiqueta objetivo)
- [x] Upload de avatar del cliente con preview instantáneo y persistencia
- [x] Upload de logo del trainer desde la sidebar
- [x] Recordatorio anti-sedentarismo configurable (por cliente o por trainer en pestaña Cardio)
- [x] Pestaña Cardio en portal trainer (objetivos, gráfica, historial)
- [x] Pestaña Medidas en portal trainer (hombros, pecho, brazos D/I, cintura, cadera, muslos D/I, gemelos D/I)
- [x] Mi Perfil del trainer — dashboard de negocio: métricas grandes (activos/inactivos/media 7 días/sin registro hoy), actividad diaria por cliente, ranking semanal con barras de score, alerta clientes sin registrar; formulario colapsable editar perfil con descartar cambios
- [x] Importación masiva de clientes desde CSV o Excel (.xlsx) con preview, barra de progreso y descarga de credenciales temporales
- [x] Tipos de cardio asignables por cliente (14 opciones); visibles en portal cliente agrupados con iconos
- [x] Suplementos suman proteína a totales de nutrición al marcarlos; score de nutrición los incluye
- [x] Edición inline/modal de ejercicios, alimentos de dieta y suplementos (botón ✎)
- [x] Drag & drop para reordenar bloques de comida en pestaña Nutrición del trainer (handle ⠿, persiste order_index)
- [x] Horario de suplementos (mañana/tarde/noche/pre-workout/post-workout) con tag de color en trainer y agrupación en cliente
- [x] Instrucciones por sección (Nutrición, Cardio, Suplementación) — textarea + dictado por voz (Web Speech API, es-ES), guardado con feedback visual en botón; cliente ve instrucciones como caja azul al inicio de cada sección
- [x] Instrucciones por día de entrenamiento — campo `notes` en workout_days, dictado por voz, se guarda con el día; cliente ve la nota dentro de la tarjeta del día
- [x] Editor de plan con IA (Groq Llama 3.3 70B) — trainer dicta instrucción en lenguaje natural, Edge Function `ai-plan-editor` la procesa y devuelve acciones JSON que se aplican al plan al momento (add/edit/remove_exercise, update_day)
- [x] Editor IA en Nutrición (`ai-diet-editor`) — acciones: add_meal, add_food, edit_food, remove_food, rename_meal, remove_meal
- [x] Editor IA en Cardio (`ai-cardio-editor`) — acciones: set_steps_goal, set_cardio_goal, set_reminder, set_cardio_types
- [x] Editor IA en Suplementación (`ai-supls-editor`) — acciones: add_supplement, edit_supplement, remove_supplement
- [x] Editor IA en Medidas (`ai-measures-editor`) — extrae campos de medidas corporales de texto natural e inserta en body_measurements
- [x] Chat IA para cliente (`ai-chat`) — Groq Llama 3.1 8B, proxy Edge Function (API key server-side)
- [x] Importación masiva de clientes via Edge Function `bulk-import-clients` (Admin API, sin rate limits, email auto-confirmado)
- [x] Botón "Invitar cliente" en pestaña Perfil — genera magic link via `generate-invite-link`, muestra modal con mensaje de bienvenida pre-redactado (editable), botones Copiar y WhatsApp

## Notas de arquitectura (sesión 23/05)
- `SUPL_TIMINGS` y `CARDIO_TYPES` son constantes definidas en `trainer-app.js`; los mismos valores están duplicados inline en `client-app.js` (candidato a extraer a un módulo compartido)
- Drag & drop de comidas usa HTML5 nativo (`draggable`), activado solo desde el handle `.drag-handle` vía `mousedown` para evitar conflictos con inputs
- El snapshot de "Mi Perfil" se guarda en `TRAINER_PROFILE_SNAPSHOT`; al guardar se actualiza el snapshot y el nombre en sidebar

## Notas de arquitectura (sesión 25/05)
- `notesCard(fieldId, value, dbColumn, icon, label)` — helper en trainer-app.js que genera tarjeta con textarea + mic + botón guardar; llama a `saveNotes(dbColumn, fieldId, btn)` que hace update directo a `clients`
- `startVoice(targetId, btn)` — toggle: 1er click inicia SpeechRecognition (continuous, es-ES), 2º click para y resetea; acumula resultados isFinal en el textarea; `_activeRecognition` previene sesiones múltiples
- `applyAIInstruction(btn)` — recoge plan completo de `SELECTED_CLIENT_DATA.workouts`, llama Edge Function `ai-plan-editor`, aplica acciones via `applyAIPlanActions(actions)`
- Importación masiva: CSV parseado nativamente; Excel via SheetJS (cargado lazy desde CDN); columnas normalizadas (español/inglés) con `normalizeKey()` (elimina tildes, unidades entre paréntesis, caracteres especiales); contraseñas auto-generadas si faltan; `window._lastImportOk` para pasar resultados al botón de descarga

## Notas de arquitectura (sesión 01/06)
- Todos los editores IA usan **Groq** (llama-3.3-70b-versatile para plan/dieta/cardio/supls/medidas, llama-3.1-8b-instant para chat). Secret: `GROQ_API_KEY` en Supabase. La key se sanitiza con `.replace(/[^a-zA-Z0-9_]/g, '')` para evitar ByteString errors por caracteres invisibles.
- Patrón CORS obligatorio en Edge Functions: try-catch que SIEMPRE devuelve headers CORS incluso en error 500, o el browser bloquea la respuesta.
- `bulk-import-clients`: recibe array de clientes, usa `adminClient.auth.admin.createUser` (bypass rate limits), inserta profiles+clients+body_measurements, devuelve `{results:[{nombre, ok, email, password, msg}]}`. `window._lastImportOk` guarda los OK para la descarga CSV.
- `generate-invite-link`: `adminClient.auth.admin.generateLink({type:'magiclink', email, options:{redirectTo:'https://www.tupreparador.es/client.html'}})`, devuelve `{link: linkData.properties.action_link}`. El modal dinámico necesita clase `.open` para ser visible (CSS de trainer.html).
- `inviteClient()` / `showInviteModal(msg)` — en trainer-app.js. Modal creado dinámicamente con `overlay.className = 'modal-overlay open'`. Botones: copyInviteMsg() y shareInviteWhatsApp() (wa.me/?text=...).

## Pendiente
- [ ] Activar Stripe (añadir secrets en Supabase Edge Functions + crear webhook)
- [ ] Confirmar emails automáticamente (Supabase → Auth → desactivar "Confirm email")
