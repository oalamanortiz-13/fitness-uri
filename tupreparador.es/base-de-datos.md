# Base de datos — Supabase PostgreSQL

## Tablas principales

### `profiles`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | = auth.uid() |
| `role` | TEXT | `admin` / `trainer` / `client` |
| `full_name` | TEXT | |
| `email` | TEXT | |

---

### `trainers`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | = profiles.id |
| `bio` | TEXT | |
| `specialty` | TEXT | |
| `max_clients` | INT | |
| `logo_url` | TEXT | URL Storage bucket `avatars` |
| `subscription_status` | TEXT | `trialing` / `active` / `past_due` / `canceled` |
| `trial_ends_at` | TIMESTAMPTZ | |
| `stripe_customer_id` | TEXT | |
| `stripe_subscription_id` | TEXT | |

---

### `clients`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | = profiles.id |
| `trainer_id` | UUID FK | → trainers.id |
| `age` | INT | |
| `height_cm` | NUMERIC | |
| `weight_start` | NUMERIC | |
| `weight_goal` | NUMERIC | |
| `kcal_goal` | INT | |
| `protein_goal` | INT | |
| `steps_goal` | INT | |
| `cardio_goal_min` | INT | |
| `plan_start_date` | DATE | |
| `plan_weeks` | INT | |
| `phase_name` | TEXT | |
| `notes` | TEXT | Notas generales |
| `golden_rules` | TEXT[] | Reglas de oro del cliente |
| `active` | BOOLEAN | |
| `avatar_url` | TEXT | URL Storage |
| `goal_label` | TEXT | Etiqueta de objetivo |
| `reminder_interval_min` | INT | Recordatorio anti-sedentarismo (min) |
| `cardio_types` | TEXT[] | 14 tipos de cardio disponibles |
| `notes_workout` | TEXT | Instrucciones sección Entreno |
| `notes_diet` | TEXT | Instrucciones sección Nutrición |
| `notes_cardio` | TEXT | Instrucciones sección Cardio |
| `notes_supls` | TEXT | Instrucciones sección Suplementos |

---

### `daily_logs`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `client_id` | UUID FK | |
| `log_date` | DATE | |
| `steps` | INT | |
| `cardio_min` | INT | |
| `weight_kg` | NUMERIC | |
| `body_fat_pct` | NUMERIC(4,1) | % grasa corporal diaria *(migración 012)* |
| `rpe` | INT | Esfuerzo percibido 1-10 |
| `checklist` | JSONB | |
| `exercises_done` | UUID[] | IDs ejercicios completados |
| `loads` | JSONB | `{exId: [kg_s1, kg_s2, ...]}` — cargas por serie |
| `foods_checked` | UUID[] | IDs alimentos marcados |
| `calendar_status` | TEXT | `done` / `miss` |
| `score` | NUMERIC | Score total 0-100 |
| `score_training` | NUMERIC | Componente entrenamiento |
| `score_nutrition` | NUMERIC | Componente nutrición |
| `score_cardio` | NUMERIC | Componente cardio |

---

### `body_measurements`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | |
| `client_id` | UUID FK | |
| `measured_at` | DATE | |
| `weight_kg` | NUMERIC | |
| `body_fat_pct` | NUMERIC | |
| `waist_cm` | NUMERIC | |
| `hips_cm` | NUMERIC | |
| `chest_cm` | NUMERIC | |
| `shoulder_cm` | NUMERIC | |
| `arm_r_cm` | NUMERIC | Brazo derecho |
| `arm_l_cm` | NUMERIC | Brazo izquierdo |
| `thigh_r_cm` | NUMERIC | Muslo derecho |
| `thigh_l_cm` | NUMERIC | Muslo izquierdo |
| `calf_r_cm` | NUMERIC | Gemelo derecho |
| `calf_l_cm` | NUMERIC | Gemelo izquierdo |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

## Storage

Bucket: **`avatars`** (público)

| Path | Contenido |
|------|-----------|
| `client-{USER_ID}` | Avatar cliente (sin extensión, sobreescribe) |
| `trainer-{TRAINER_ID}.ext` | Logo trainer |
| `progress-{USER_ID}-{slot}.{ext}` | Fotos de progreso cliente (slot 0 y 1) |

---

## RLS (Row Level Security)

| Tabla | Trainer puede | Cliente puede |
|-------|--------------|---------------|
| `clients` | SELECT/UPDATE sus propios clientes | SELECT/UPDATE su propia fila (`id = auth.uid()`) |
| `trainers` | SELECT/UPDATE su propia fila | SELECT del trainer asignado |
| `profiles` | Leer perfiles de sus clientes | Leer el suyo |
| `body_measurements` | Leer/escribir medidas de sus clientes | Leer/escribir las suyas |

---

## Migraciones aplicadas en producción

| Migración | Descripción |
|-----------|-------------|
| `001_trainer_self_register` | Auto-registro de trainers |
| `002_invitations` | Sistema de invitaciones a clientes |
| `003_subscription_columns` | Columnas Stripe en trainers |
| `004_avatar_logo_columns` | `avatar_url` en clients, `logo_url` en trainers, `goal_label`, bucket `avatars` |
| `005_body_measurements` | Tabla `body_measurements` con RLS |
| `006_measurements_split_fields` | Separar brazos/muslos/gemelos D/I |
| `007_cardio_types` | `cardio_types TEXT[]` en clients |
| `008_supplement_timing` | `timing TEXT` en supplements |
| `009_section_notes` | `notes_workout/diet/cardio/supls TEXT` en clients |
| `010_workout_day_notes` | `notes TEXT` en workout_days |
| `011_trainer_trial_on_signup` | Trial automático al registrarse |
| `012_body_fat_daily_log` | `body_fat_pct NUMERIC(4,1)` en daily_logs |

---

## Edge Functions desplegadas

| Función | Descripción |
|---------|-------------|
| `create-checkout-session` | Genera sesión Stripe Checkout |
| `stripe-webhook` | Maneja eventos webhook de Stripe |
| `create-client` | Crea cliente desde invitación |
| `create-user` | Crea usuario admin |
| `generate-invite-link` | Genera enlace de invitación |
| `ai-plan-editor` | Editor de plan con Gemini 2.0 Flash |

---

## SQL útil de referencia

```sql
-- Ver usuarios y roles
SELECT p.full_name, p.email, p.role, c.trainer_id
FROM profiles p LEFT JOIN clients c ON c.id = p.id;

-- Confirmar emails pendientes
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Estado suscripciones trainers
SELECT t.id, p.full_name, t.subscription_status, t.trial_ends_at
FROM trainers t JOIN profiles p ON p.id = t.id;

-- Scores del mes de un cliente
SELECT log_date, score, score_training, score_nutrition, score_cardio
FROM daily_logs WHERE client_id = '<uuid>' ORDER BY log_date DESC LIMIT 30;

-- Medidas de un cliente
SELECT measured_at, weight_kg, body_fat_pct, shoulder_cm, chest_cm,
  arm_r_cm, arm_l_cm, waist_cm, hips_cm, thigh_r_cm, thigh_l_cm, calf_r_cm, calf_l_cm
FROM body_measurements WHERE client_id = '<uuid>' ORDER BY measured_at DESC;

-- Fotos de progreso en Storage (verificar existencia)
-- HEAD fetch a: https://<project>.supabase.co/storage/v1/object/public/avatars/progress-{USER_ID}-{slot}.{ext}
```
