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
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', (err as Error).message)
    console.error('Secret defined:', !!webhookSecret, '| Sig header:', sig?.substring(0, 30))
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
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
