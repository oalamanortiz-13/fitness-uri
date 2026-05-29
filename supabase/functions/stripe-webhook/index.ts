import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  let event: Stripe.Event

  // Try V1 signature (classic webhooks)
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (v1Err) {
    // V2 signature: new Stripe Event Destinations send "t=...,v2=..." header
    // For V2, verify manually using HMAC-SHA256 on "v2:" + timestamp + "." + body
    try {
      const parts = sig.split(',').reduce((acc: Record<string, string>, part) => {
        const [k, v] = part.split('=')
        acc[k] = v
        return acc
      }, {})

      if (parts.v2) {
        const timestamp = parts.t
        const toSign = `v2:${timestamp}.${body}`
        const encoder = new TextEncoder()
        const keyData = encoder.encode(webhookSecret.replace('whsec_', ''))
        const secretBytes = Uint8Array.from(atob(webhookSecret.replace('whsec_', '')), c => c.charCodeAt(0))
        const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
        const sigBytes = Uint8Array.from(atob(parts.v2), c => c.charCodeAt(0))
        const msgBytes = encoder.encode(toSign)
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, msgBytes)
        if (!valid) throw new Error('V2 signature invalid')
        event = JSON.parse(body) as Stripe.Event
      } else {
        throw v1Err
      }
    } catch (v2Err) {
      console.error('Webhook signature error (V1):', (v1Err as Error).message)
      console.error('Webhook signature error (V2):', (v2Err as Error).message)
      console.error('Secret defined:', !!webhookSecret, '| Sig:', sig?.substring(0, 50))
      return new Response(`Webhook Error: ${(v1Err as Error).message}`, { status: 400 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const trainerId = sub.metadata?.trainer_id
      if (!trainerId) break

      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active'
        : sub.status === 'past_due' ? 'past_due'
        : sub.status === 'canceled' ? 'canceled'
        : 'unpaid'

      await supabase.from('trainers').update({
        stripe_subscription_id: sub.id,
        subscription_status: status,
      }).eq('id', trainerId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const trainerId = sub.metadata?.trainer_id
      if (!trainerId) break

      await supabase.from('trainers').update({
        subscription_status: 'canceled',
        stripe_subscription_id: null,
      }).eq('id', trainerId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      await supabase.from('trainers')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      if (invoice.billing_reason !== 'subscription_create') {
        await supabase.from('trainers')
          .update({ subscription_status: 'active' })
          .eq('stripe_customer_id', customerId)
      }
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
