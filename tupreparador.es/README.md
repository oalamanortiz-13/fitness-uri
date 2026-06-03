# Tu Preparador — Documentación de Proyecto

> Plataforma multi-tenant de fitness para preparadores físicos y sus clientes.

---

## Identidad

| Campo | Valor |
|-------|-------|
| Nombre | Tu Preparador |
| Dominio producción | www.tupreparador.es |
| URL temporal | fitness-uri.vercel.app |
| Repositorio | oalamanortiz-13/fitness-uri |
| Supabase proyecto | cwwvwrzqlavuyqhyeepu |
| Stack | Vanilla HTML/CSS/JS + Supabase + Vercel |

---

## Estructura de archivos

```
fitness-uri/
├── index.html              # Landing page pública
├── login.html              # Login + recuperación de contraseña
├── register.html           # Registro de preparador (trial 14 días)
├── reset-password.html     # Nueva contraseña tras link de email
├── invite.html             # Activación de cuenta de cliente
├── client.html             # Portal del cliente (mobile-first, max 480px)
├── trainer.html            # Portal del preparador (desktop, max 900px)
├── admin.html              # Panel admin
├── Logopreparador.png      # Logo oficial (PNG RGBA transparente)
├── css/shared.css          # Design system completo
├── js/
│   ├── supabase-client.js  # Init Supabase
│   ├── auth.js             # requireRole(), redirectByRole(), logout()
│   ├── client-app.js       # ~1500 líneas — lógica portal cliente
│   ├── trainer-app.js      # Lógica portal trainer + Stripe
│   └── admin-app.js        # Lógica panel admin
├── supabase/
│   ├── schema.sql          # Schema original (referencia)
│   ├── migrations/         # Migraciones SQL ejecutadas en producción
│   └── functions/          # Edge Functions desplegadas
└── tupreparador.es/        # Esta carpeta — documentación del proyecto
```

---

## Roles y flujo de acceso

| Rol | Portal | Acciones |
|-----|--------|----------|
| `admin` | admin.html | Crear trainers, ver stats globales |
| `trainer` | trainer.html | Crear/gestionar clientes, asignar planes |
| `client` | client.html | Ver plan, registrar progreso diario |

Cada portal llama a `requireRole('rol')` al inicio. Si la sesión no coincide, redirige al portal correcto.

---

## Deploy

- **Push a `main`** → Vercel despliega automáticamente a producción
- **Ramas de desarrollo:** `claude/vibrant-franklin-tBzIG`, `claude/wizardly-wright-kr57y`, etc. → mergear a `main`
- **Rama actual de trabajo:** `claude/vibrant-franklin-tBzIG`

---

## Usuarios en producción

| Rol | Email | ID Supabase |
|-----|-------|-------------|
| Admin | oalamanortiz@gmail.com | — |
| Trainer (U BODY COACH) | oalaman@icloud.com | `53ef0bfc-df61-4904-8a4e-fb24b3040874` |
| Trainer (I LOVE MUSCLE) | ilovemusclenutrition@gmail.com | — |
| Cliente | info.estefaniapadron@gmail.com | — |
| Cliente | jaimeruiz@gmail.com | — |
| Cliente | marina@emedemarina.com | — |

---

## Índice de documentación

- [`arquitectura.md`](./arquitectura.md) — Arquitectura técnica, patrones, funciones clave
- [`base-de-datos.md`](./base-de-datos.md) — Schema Supabase, tablas, RLS, migraciones, Storage
- [`funcionalidades.md`](./funcionalidades.md) — Todas las features implementadas y pendientes
- [`design-system.md`](./design-system.md) — Tokens CSS, componentes, tipografía, animaciones
- [`sesiones.md`](./sesiones.md) — Log cronológico de sesiones de desarrollo
- [`negocio.md`](./negocio.md) — Modelo de negocio, Stripe, pricing
