import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('No autorizado', 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return errorResponse('Token inválido', 401)

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'trainer') {
      return errorResponse('Solo los preparadores pueden invitar clientes', 403)
    }

    const { clientId } = await req.json()
    if (!clientId) return errorResponse('clientId requerido', 400)

    // Verify this client belongs to the trainer
    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('id, trainer_id')
      .eq('id', clientId)
      .eq('trainer_id', user.id)
      .single()

    if (!clientRow) return errorResponse('Cliente no encontrado o no pertenece a este preparador', 403)

    const { data: clientProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', clientId)
      .single()

    if (!clientProfile?.email) return errorResponse('Email del cliente no encontrado', 404)

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: clientProfile.email,
      options: {
        redirectTo: 'https://www.tupreparador.es/client.html',
      }
    })

    if (linkError) return errorResponse(linkError.message, 500)

    return new Response(JSON.stringify({ link: linkData.properties.action_link }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    return errorResponse(String(e), 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    status,
  })
}
