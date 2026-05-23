# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto
Plataforma multi-tenant de fitness para preparadores físicos y sus clientes.
- **URL producción:** fitness-uri.vercel.app
- **Supabase proyecto:** cwwvwrzqlavuyqhyeepu
- **Stack:** Vanilla HTML/CSS/JS + Supabase (Auth + PostgreSQL) + Vercel (estático)
- **Deploy:** push a `main` → Vercel despliega automáticamente. Desarrollar en `claude/exciting-maxwell-3GNsG`, mergear a `main` para ver cambios en producción.

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
        ├── create-checkout-session/  # Edge Function Stripe Checkout (desplegada)
        └── stripe-webhook/           # Edge Function webhook Stripe (desplegada)
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

### Storage
- Bucket `avatars` (público): `client-{USER_ID}` para avatares de clientes, `trainer-{TRAINER_ID}.ext` para logos de trainers

### RLS crítico
- `clients`: trainer lee/escribe sus propios clientes; cliente hace SELECT y UPDATE de su propia fila
- `trainers`: trainer hace SELECT/UPDATE de su propia fila; cliente hace SELECT del trainer asignado (`id IN (SELECT trainer_id FROM clients WHERE id = auth.uid())`)
- `profiles`: trainer lee perfiles de sus clientes; cliente lee el suyo

## Arquitectura client-app.js

Estado global en objeto `S` (línea ~23). Funciones clave:
- `loadClientData()` — carga CLIENT, TRAINER_PROFILE, WORKOUT_DAYS, DIET_PLAN, SUPPLEMENTS
- `loadTodayLog()` — carga estado del día actual en S (pasos, cargas, foodsChecked, flags done)
- `loadWeekCardio()` / `loadMonthLogs()` — datos de calendario y scores
- `saveLog()` — upsert debounced de daily_logs (scheduleSave() lo llama con 2s delay)
- `saveScoreComponent(field, value)` — guarda score parcial y recalcula total; field = 'training'|'nutrition'|'cardio'
- `finishWorkout()` / `finishNutrition()` / `finishCardio()` — botones de completado, one-per-day
- `renderWorkout(dayIdx)` — renderiza ejercicios + botón finalizar
- `applyClientConfig()` — aplica todos los datos CLIENT al DOM
- `applyClientProfile(myProfile)` — nombre, avatar, logo trainer, tags objetivo

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
3. Tabs: Perfil / Entreno / Dieta / Suplementos / Progreso → cada uno tiene `render*Tab()`
4. `saveProfile()` actualiza tabla `clients` con todos los campos del formulario

Sidebar superior muestra logo del trainer (uploadable) + nombre.

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
```

## Pendiente
- [ ] Activar Stripe (añadir secrets en Supabase Edge Functions + crear webhook)
- [ ] Confirmar emails automáticamente (Supabase → Auth → desactivar "Confirm email")
- [ ] Chat IA — API key de Anthropic expuesta en cliente, mover a Edge Function proxy
- [ ] Perfil del preparador — sección "Mi perfil" en trainer.html
