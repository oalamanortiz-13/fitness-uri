# fitness-uri — Estado del proyecto

## Qué es esto
Plataforma multi-tenant de fitness para preparadores físicos y sus clientes.
- **URL producción:** fitness-uri.vercel.app
- **Supabase proyecto:** cwwvwrzqlavuyqhyeepu
- **Stack:** Vanilla HTML/CSS/JS + Supabase (Auth + PostgreSQL) + Vercel

## Estructura de archivos
```
fitness-uri/
├── index.html              # Login + recuperación de contraseña (vista inline)
├── reset-password.html     # Nueva contraseña tras link de email
├── client.html             # Portal del cliente
├── trainer.html            # Portal del preparador
├── admin.html              # Panel admin
├── css/shared.css          # Design system completo
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
    │   └── 003_subscription_columns.sql  # Columnas Stripe en trainers (YA EJECUTADO)
    └── functions/
        ├── create-checkout-session/  # Edge Function Stripe Checkout (YA DESPLEGADA)
        └── stripe-webhook/           # Edge Function webhook Stripe (YA DESPLEGADA)
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
- **Trainer:** I LOVE MUSCLE — ilovemusclenutrition@gmail.com
- **Trainer:** ruben rodriguez — ruben@gmail.com
- **Cliente:** Estefania Padron Henao — info.estefaniapadron@gmail.com (vinculada a U BODY COACH)
- **Cliente:** jaime ruiz — jaimeruiz@gmail.com (vinculado a U BODY COACH)
- **Cliente:** marina — marina@emedemarina.com

## Datos de Estefania (ya en BD)
- **Perfil:** 31 años, 159 cm, 58 kg → objetivo 60 kg, 2050 kcal/día, 110g proteína, 8000 pasos
- **Entreno:** 5 días (Lun-Vie) + 2 descanso. Lun: Tren Sup Empuje, Mar: Tren Inf, Mié: Cardio+Movilidad, Jue: Tren Sup Tirón, Vie: Full Body
- **Dieta:** 5 comidas · ~2005 kcal · ~158g proteína (Desayuno, Media mañana, Comida, Merienda, Cena)

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

### Edge Functions desplegadas en Supabase
- `create-checkout-session` — crea sesión de Stripe Checkout para el trainer
- `stripe-webhook` — recibe eventos de Stripe y actualiza subscription_status en BD

### Variables de entorno necesarias en Supabase Edge Functions (PENDIENTE añadir)
```
STRIPE_SECRET_KEY       = sk_live_...
STRIPE_PRICE_ID         = price_...
STRIPE_WEBHOOK_SECRET   = whsec_...
APP_URL                 = https://fitness-uri.vercel.app
```

### Pasos pendientes para activar Stripe
1. Crear producto en Stripe dashboard → €9,90/mes/unidad → copiar price_...
2. Añadir variables de entorno en Supabase → Edge Functions → Manage secrets
3. Crear webhook en Stripe → URL: `https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
4. Copiar Signing secret del webhook → ponerlo como STRIPE_WEBHOOK_SECRET

## Problemas resueltos
1. Clave Supabase — usar JWT anon key (eyJ...) no la publishable key (sb_publishable_...)
2. RLS profiles — añadir policy para que trainer lea perfiles de sus clientes
3. signUp cambia sesión activa — guardar y restaurar sesión del trainer/admin tras signUp
4. Trigger handle_new_user — añadir EXCEPTION WHEN OTHERS para que no bloquee creación de usuarios
5. Políticas clients — WITH CHECK necesario para INSERT/UPDATE
6. Migration 003 (columnas Stripe) — ya ejecutada en producción
7. Edge functions Stripe — ya desplegadas (create-checkout-session + stripe-webhook)
8. Recuperación de contraseña — flujo completo con email en español y reset-password.html
   - Redirect URL añadida en Supabase Auth: https://fitness-uri.vercel.app/reset-password.html
   - Plantilla de email personalizada en español con diseño oscuro

## Pendiente (producto)
- [ ] Activar Stripe (añadir secrets en Supabase Edge Functions + crear webhook en Stripe)
- [ ] Confirmar emails automáticamente (Supabase → Auth → Sign In/Providers → desactivar "Confirm email")
- [ ] Probar que Estefania puede entrar y ver su dashboard (entreno + dieta ya cargados)
- [ ] Probar flujo completo: trainer modifica plan → cliente lo ve actualizado
- [ ] Chat IA del cliente — falta configurar API key de Anthropic (actualmente sin autenticación)

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
