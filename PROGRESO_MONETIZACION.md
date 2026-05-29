# Progreso Monetización — Tu Preparador

Plan de monetización rápida priorizado. Estado a fecha de última sesión.

---

## ✅ Completado

### Punto 1 — Activar Stripe (modo test)
- Webhook conectado y funcionando (Edge Function `stripe-webhook` v10).
- Checkout operativo a **€4,90/cliente/mes** (precio de lanzamiento; en web se mostrará €9,90 tachado → €4,90).
- `subscription_status` se actualiza automáticamente en la tabla `trainers`.
- **Producto Stripe:** `prod_UZ6hBTqVhGQDl2` · **Precio:** `price_1TZyUD46JZxeoowGn5nXK3gw` (490 EUR).
- **Secrets configurados en Supabase Edge Functions:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `APP_URL=https://www.tupreparador.es`.
- ⚠️ **Nota técnica:** el webhook usa el nuevo formato "Event Destinations" del Workbench de Stripe, cuya firma V2 no valida el SDK Stripe v14. Solución temporal: en modo test se omite la verificación de firma y se parsea el body directamente (se rechazan eventos `livemode:true`). **Al pasar a producción hay que implementar verificación de firma V2 correcta (HMAC-SHA256 sobre `v2:{t}.{body}`).**

### Punto 2 — Auto-registro de trainers
- Registro en `/register.html` con **trial de 14 días automático**.
- Trigger de DB `handle_new_user` actualizado: crea perfil + fila en `trainers` con `trial_ends_at = now() + 14 días` y `specialty` desde metadata del signup.
- Migración guardada: `supabase/migrations/011_trainer_trial_on_signup.sql`.
- `register.html` pasa `specialty` en metadata del `signUp` (se eliminaron los upserts manuales poco fiables).

### Punto 3 — Landing page
- Desplegada en `main` (Vercel auto-deploy).
- Diseño con identidad de marca: navy `#03045E` + cyan `#00D4FF`, blanco `#FFFFFF`, gris `#A9B0C3`.
- Tagline: **CONECTA · ENTRENA · EVOLUCIONA**.
- Login movido a `/login.html`; registro en `/register.html`; raíz `index.html` = landing.
- `auth.js` actualizado para redirigir a `/login.html`.

### Infra / Auth
- **Site URL** de Supabase corregido a `https://www.tupreparador.es` (antes apuntaba a localhost y rompía los emails de confirmación).
- **Redirect URLs** añadidas: `https://www.tupreparador.es` y `https://www.tupreparador.es/**`.
- Confirmación de email: **se mantiene activada** (más seguro para producción).

---

## ⏳ Pendiente (para próximas sesiones)

### Punto 4 — Email transaccional
- Configurar proveedor SMTP propio con `info@tupreparador.es` (Resend / Brevo / SendGrid).
- Motivo: el email por defecto de Supabase tiene límite de ~3 emails/hora, insuficiente al captar trainers.
- Emails clave: bienvenida, aviso fin de trial, factura/recibo.

### Punto 5 — Onboarding guiado para el trainer
- Checklist de 3 pasos al primer login: "Crea tu primer cliente → Asígnale un plan → Compártele el acceso".
- Reduce churn de los primeros 7 días.

### Otros pendientes
- **Subir el logo TP real** a la landing (PNG enviado por el usuario; ahora puede estar como placeholder CSS).
- **Pasar Stripe a producción**: activar cuenta (datos negocio/banco), claves `sk_live_...`, recrear webhook y secret en modo live, e implementar verificación de firma correcta.
- Link de invitación por trainer (`tupreparador.es/unete/[slug]`) — vector de marketing orgánico.
- Página de estado de suscripción visible en portal trainer (clientes activos, coste del mes, fecha de cobro).

---

## Notas de marketing (canal de adquisición)
- Target: preparadores físicos españoles → **Instagram y TikTok**, no Google.
- Estrategia rápida: casos de éxito de trainers actuales (2), grupos de Facebook/Telegram de preparadores, precio ancla ("€4,90/cliente es menos de lo que cobras en 1h").
