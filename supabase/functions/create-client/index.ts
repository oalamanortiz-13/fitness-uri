import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verificar que quien llama es un trainer autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('No autorizado', 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
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
      return errorResponse('Solo los preparadores pueden crear clientes', 403)
    }

    const { email, password, fullName, trainerId, clientData } = await req.json()

    if (!email || !password || !fullName) return errorResponse('Email, contraseña y nombre son obligatorios', 400)
    if (trainerId !== user.id) return errorResponse('No puedes crear clientes para otro preparador', 403)

    // Crear usuario en Supabase Auth
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { role: 'client', full_name: fullName },
      email_confirm: true,
    })

    if (authError) return errorResponse(authError.message, 400)

    // Crear registro en clients (profiles se crea via trigger)
    const { error: clientError } = await supabaseAdmin
      .from('clients')
      .insert({
        id: newUser.user.id,
        trainer_id: trainerId,
        ...clientData,
      })

    if (clientError) {
      // Rollback: eliminar usuario si falla insertar cliente
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return errorResponse(clientError.message, 500)
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    return errorResponse(e.message, 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    status,
  })
}
