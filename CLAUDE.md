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
│   ├── trainer-app.js      # Lógica portal trainer
│   └── admin-app.js        # Lógica panel admin
└── supabase/
    ├── schema.sql          # Schema completo (ya ejecutado en Supabase)
    ├── policies-only.sql   # Solo policies + trigger (ya ejecutado)
    └── functions/          # Edge Functions (NO desplegadas, no necesarias)
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
- `trainers` — datos del preparador
- `clients` — datos del cliente + trainer_id
- `workout_days` + `workout_exercises` — plan de entreno (7 días)
- `diet_plans` + `diet_meals` + `diet_foods` — plan de dieta
- `supplements` — suplementos del cliente
- `daily_logs` — registro diario (peso, pasos, cardio, checklist)

## Problemas resueltos en esta sesión
1. Clave Supabase — usar JWT anon key (eyJ...) no la publishable key (sb_publishable_...)
2. RLS profiles — añadir policy para que trainer lea perfiles de sus clientes
3. signUp cambia sesión activa — guardar y restaurar sesión del trainer/admin tras signUp
4. Trigger handle_new_user — añadir EXCEPTION WHEN OTHERS para que no bloquee creación de usuarios
5. Políticas clients — WITH CHECK necesario para INSERT/UPDATE

## Pendiente para próxima sesión
- [ ] Confirmar emails automáticamente (ir a Supabase → Auth → Sign In/Providers → desactivar "Confirm email")
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
```

## Design system (CSS variables en shared.css)
- `--bg: #0f0f0f` / `--bg2: #1a1a1a` / `--bg3: #242424`
- `--blue: #378ADD` (primario) / `--green: #1D9E75` / `--amber: #BA7517` / `--red: #E24B4A`
- Max-width: 480px, mobile-first
