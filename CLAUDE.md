# fitness-uri — Estado del proyecto

## Qué es esto
Plataforma multi-tenant de fitness para preparadores físicos y sus clientes.
- **URL producción:** fitness-uri.vercel.app
- **Supabase proyecto:** cwwvwrzqlavuyqhyeepu
- **Stack:** Vanilla HTML/CSS/JS + Supabase (Auth + PostgreSQL) + Vercel

## Estructura de archivos
```
fitness-uri/
├── index.html          # Login (punto de entrada para todos)
├── client.html         # Portal del cliente
├── trainer.html        # Portal del preparador
├── admin.html          # Panel admin
├── css/shared.css      # Design system completo
├── js/
│   ├── supabase-client.js  # Init Supabase (credenciales ya configuradas)
│   ├── auth.js             # Login, logout, redirección por rol
│   ├── client-app.js       # Lógica portal cliente
│   ├── trainer-app.js      # Lógica portal trainer (tiene lógica de suscripción Stripe)
│   └── admin-app.js        # Lógica panel admin
└── supabase/
    ├── schema.sql          # Schema completo (ya ejecutado en Supabase)
    ├── policies-only.sql   # Solo policies + trigger (ya ejecutado)
    ├── migrations/
    │   └── 003_subscription_columns.sql  # Columnas Stripe en trainers (PENDIENTE ejecutar)
    └── functions/
        ├── create-checkout-session/  # Edge Function Stripe Checkout (PENDIENTE desplegar)
        └── stripe-webhook/           # Edge Function webhook Stripe (PENDIENTE desplegar)
```

## Roles y acceso
| Rol | Portal | Puede hacer |
|-----|--------|-------------|
| admin | admin.html | Crear trainers, ver stats globales |
| trainer | trainer.html | Crear/gestionar clientes, asignar planes |
| client | client.html | Ver su plan, registrar progreso |

## Usuarios creados en producción
- **Admin:** oalamanortiz@gmail.com
- **Trainer:** U BODY COACH — oalaman@icloud.com (ID: 53ef0bfc-df61-4904-8a4e-fb24b3040874)
- **Cliente:** Estefania Padron Henao — info.estefaniapadron@gmail.com (vinculada a U BODY COACH)

## Supabase — tablas principales
- `profiles` — todos los usuarios (role: admin/trainer/client)
- `trainers` — datos del preparador + columnas Stripe (pendiente migración 003)
- `clients` — datos del cliente + trainer_id
- `workout_days` + `workout_exercises` — plan de entreno (7 días)
- `diet_plans` + `diet_meals` + `diet_foods` — plan de dieta
- `supplements` — suplementos del cliente
- `daily_logs` — registro diario (peso, pasos, cardio, checklist)

## Modelo de negocio Stripe (implementado, pendiente activar)
- **Precio:** €9,90 por cliente activo / mes
- **Trial:** 14 días gratis al crear cuenta trainer
- **Producto Stripe:** por crear en dashboard (price_...)
- **Flujo:** trainer ve banner en sidebar → botón → Stripe Checkout → webhook actualiza BD

### Columnas añadidas a `trainers` (migration 003, PENDIENTE ejecutar en Supabase SQL Editor)
```sql
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'unpaid'));
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
  DEFAULT NOW() + INTERVAL '14 days';
```

### Variables de entorno necesarias en Supabase Edge Functions
```
STRIPE_SECRET_KEY       = sk_live_...
STRIPE_PRICE_ID         = price_...
STRIPE_WEBHOOK_SECRET   = whsec_...
APP_URL                 = https://fitness-uri.vercel.app
```

### Pasos pendientes para activar Stripe
1. Ejecutar migration 003 en Supabase → SQL Editor
2. Crear producto en Stripe dashboard → €9,90/mes/unidad → copiar price_...
3. Añadir variables de entorno en Supabase → Edge Functions → Manage secrets
4. Desplegar funciones: `supabase functions deploy create-checkout-session` y `stripe-webhook`
5. Crear webhook en Stripe → URL: `https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
6. Copiar Signing secret del webhook → ponerlo como STRIPE_WEBHOOK_SECRET

## Problemas resueltos
1. Clave Supabase — usar JWT anon key (eyJ...) no la publishable key (sb_publishable_...)
2. RLS profiles — añadir policy para que trainer lea perfiles de sus clientes
3. signUp cambia sesión activa — guardar y restaurar sesión del trainer/admin tras signUp
4. Trigger handle_new_user — añadir EXCEPTION WHEN OTHERS para que no bloquee creación de usuarios
5. Políticas clients — WITH CHECK necesario para INSERT/UPDATE

## Pendiente (producto)
- [ ] Ejecutar migration 003 y activar Stripe (ver pasos arriba)
- [ ] Confirmar emails automáticamente (Supabase → Auth → Sign In/Providers → desactivar "Confirm email")
- [ ] Probar que el cliente (Estefania) puede entrar y ver su dashboard
- [ ] Migrar datos de Uri (el cliente original hardcodeado) a la base de datos
- [ ] Probar flujo completo: trainer asigna plan → cliente lo ve en su portal
- [ ] Añadir datos de entreno y dieta a Estefania desde el portal del trainer

## SQL útil para troubleshooting
```sql
-- Ver todos los usuarios y sus roles
SELECT p.full_name, p.email, p.role, c.trainer_id
FROM profiles p
LEFT JOIN clients c ON c.id = p.id;

-- Confirmar emails pendientes
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Vincular cliente huérfano a trainer
INSERT INTO clients (id, trainer_id)
SELECT p.id, '53ef0bfc-df61-4904-8a4e-fb24b3040874'
FROM profiles p
WHERE p.role = 'client'
AND p.id NOT IN (SELECT id FROM clients);

-- Ver estado suscripciones trainers
SELECT t.id, p.full_name, p.email,
       t.subscription_status, t.trial_ends_at,
       t.stripe_customer_id, t.stripe_subscription_id
FROM trainers t JOIN profiles p ON p.id = t.id;
```

## Design system (CSS variables en shared.css)
- `--bg: #0f0f0f` / `--bg2: #1a1a1a` / `--bg3: #242424`
- `--blue: #378ADD` (primario) / `--green: #1D9E75` / `--amber: #BA7517` / `--red: #E24B4A`
- Max-width: 480px, mobile-first
