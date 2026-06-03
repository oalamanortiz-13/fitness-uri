# Modelo de negocio

## Propuesta de valor

**Tu Preparador** es una plataforma SaaS multi-tenant donde:
- Los **preparadores físicos** gestionan a sus clientes, asignan planes de entrenamiento y nutrición, y hacen seguimiento de su progreso.
- Los **clientes** registran su actividad diaria (entreno, nutrición, cardio), ven su progreso y se comunican con su preparador.

---

## Pricing

| Plan | Precio | Período |
|------|--------|---------|
| Trial | Gratis | 14 días |
| Activo | **€9,90 por cliente activo** | Mensual |

El modelo es **pay-per-seat**: el trainer paga por cada cliente que tenga activo en la plataforma, no una tarifa fija.

---

## Stripe (implementado, pendiente activar)

### Estructura técnica
- **Edge Function** `create-checkout-session` — genera sesión de pago Stripe Checkout
- **Edge Function** `stripe-webhook` — procesa eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- **Tabla `trainers`** guarda: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `trial_ends_at`

### Estados de suscripción
| Status | Significado |
|--------|-------------|
| `trialing` | Trial activo (14 días desde registro) |
| `active` | Suscripción pagada activa |
| `past_due` | Pago fallido, acceso en gracia |
| `canceled` | Suscripción cancelada |

### Para activar en producción
1. Crear producto y precio en Stripe Dashboard (€9,90/cliente/mes o precio base mensual)
2. Añadir en Supabase → Edge Functions → Secrets:
   - `STRIPE_SECRET_KEY` — clave secreta de Stripe
   - `STRIPE_PRICE_ID` — ID del precio creado
   - `STRIPE_WEBHOOK_SECRET` — secreto del webhook
   - `APP_URL` — https://www.tupreparador.es
3. Crear webhook en Stripe Dashboard apuntando a la Edge Function `stripe-webhook`
4. Verificar que `subscription_status` se actualiza correctamente en `trainers`

---

## Trial automático

Al registrarse, cada trainer recibe automáticamente:
- `subscription_status = 'trialing'`
- `trial_ends_at = NOW() + 14 días`

Gestionado por migración `011_trainer_trial_on_signup` (trigger en auth.users).

---

## Usuarios en producción (junio 2026)

| Trainer | Clientes | Estado |
|---------|---------|--------|
| U BODY COACH (oalaman@icloud.com) | Estefanía, Jaime, Marina | Trial/Activo |
| I LOVE MUSCLE (ilovemusclenutrition@gmail.com) | — | — |

---

## Roadmap de monetización

1. **Fase 1 (actual):** Trial gratuito, validar producto
2. **Fase 2:** Activar Stripe, cobro automático por clientes activos
3. **Fase 3:** Plan Premium para trainers (más herramientas IA, informes PDF, marca blanca)
4. **Fase 4:** Marketplace — clientes buscan preparadores directamente en la plataforma
