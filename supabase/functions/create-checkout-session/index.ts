import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar sesión del trainer
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) throw new Error('No autorizado')

    // Obtener datos del trainer
    const { data: trainer } = await supabase
      .from('trainers')
      .select('stripe_customer_id, profiles(full_name, email)')
      .eq('id', user.id)
      .single()

    const profile = (trainer as any)?.profiles
    const activeClientCount = await getActiveClientCount(supabase, user.id)

    // Crear o recuperar cliente de Stripe
    let customerId = trainer?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        name: profile?.full_name || '',
        metadata: { trainer_id: user.id },
      })
      customerId = customer.id
      await supabase.from('trainers').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const { successUrl, cancelUrl } = await req.json()

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: Deno.env.get('STRIPE_PRICE_ID')!,
        quantity: Math.max(1, activeClientCount),
      }],
      subscription_data: {
        metadata: { trainer_id: user.id },
      },
      success_url: successUrl || `${Deno.env.get('APP_URL')}/trainer.html?payment=success`,
      cancel_url:  cancelUrl  || `${Deno.env.get('APP_URL')}/trainer.html?payment=cancel`,
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function getActiveClientCount(supabase: any, trainerId: string): Promise<number> {
  const { count } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .eq('active', true)
  return count || 0
}
