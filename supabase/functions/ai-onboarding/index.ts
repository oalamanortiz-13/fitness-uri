import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AI_TRAINER_ID = '00000000-0000-0000-0000-000000000001'

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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado')
    const token = authHeader.replace('Bearer ', '')

    // Decode JWT to get user ID (token comes from Supabase auth, trusted source)
    let userId: string
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.sub
      if (!userId) throw new Error('no sub')
    } catch {
      throw new Error('Token inválido')
    }

    const { goal, level, equipment, days_per_week, duration, age, weight, target_weight, height } = await req.json()

    const plan = await generatePlan({ goal, level, equipment, days_per_week, duration, age, weight, target_weight, height })

    // Crear fila en clients
    const { error: clientError } = await supabase.from('clients').upsert({
      id: userId,
      trainer_id: AI_TRAINER_ID,
      age: age ? parseInt(age) : null,
      height_cm: height ? parseFloat(height) : null,
      weight_start: weight ? parseFloat(weight) : null,
      weight_goal: target_weight ? `${target_weight} kg` : null,
      kcal_goal: plan.client_config.kcal_goal,
      protein_goal: plan.client_config.protein_goal,
      steps_goal: plan.client_config.steps_goal,
      cardio_goal_min: plan.client_config.cardio_goal_min,
      plan_start_date: new Date().toISOString().split('T')[0],
      plan_weeks: plan.client_config.plan_weeks || (duration === '4 semanas' ? 4 : duration === '8 semanas' ? 8 : duration === '6 meses o más' ? 24 : 12),
      phase_name: plan.client_config.phase_name,
      golden_rules: plan.client_config.golden_rules || [],
      active: true,
      goal_label: goal,
      reminder_interval_min: 45,
    })
    if (clientError) throw new Error('Error creando perfil: ' + clientError.message)

    // Insertar días de entrenamiento
    for (const day of plan.workout_days) {
      const { data: wd, error: wdErr } = await supabase
        .from('workout_days')
        .insert({
          client_id: userId,
          day_index: day.day_index,
          title: day.title,
          duration: day.duration || '60 min',
          order_index: day.day_index,
        })
        .select('id')
        .single()
      if (wdErr) continue

      for (let i = 0; i < (day.exercises || []).length; i++) {
        const ex = day.exercises[i]
        await supabase.from('workout_exercises').insert({
          workout_day_id: wd!.id,
          name: ex.name,
          sets_reps: ex.sets_reps,
          note: ex.note || '',
          order_index: i,
        })
      }
    }

    // Insertar plan de dieta
    const { data: dp } = await supabase
      .from('diet_plans')
      .insert({ client_id: userId, name: 'Plan principal', active: true })
      .select('id')
      .single()

    if (dp && plan.diet_plan?.meals) {
      for (let mi = 0; mi < plan.diet_plan.meals.length; mi++) {
        const meal = plan.diet_plan.meals[mi]
        const { data: dm } = await supabase
          .from('diet_meals')
          .insert({
            diet_plan_id: dp.id,
            name: meal.name,
            icon: meal.icon || 'ti-sun',
            order_index: mi,
          })
          .select('id')
          .single()

        if (dm && meal.foods) {
          for (let fi = 0; fi < meal.foods.length; fi++) {
            const food = meal.foods[fi]
            await supabase.from('diet_foods').insert({
              diet_meal_id: dm.id,
              name: food.name,
              protein_g: food.protein_g || 0,
              kcal: food.kcal || 0,
              order_index: fi,
            })
          }
        }
      }
    }

    // Insertar suplementos
    if (plan.supplements?.length) {
      for (let si = 0; si < plan.supplements.length; si++) {
        const s = plan.supplements[si]
        await supabase.from('supplements').insert({
          client_id: userId,
          name: s.name,
          dose: s.dose || '',
          protein_g: s.protein_g || 0,
          kcal: s.kcal || 0,
          order_index: si,
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('ai-onboarding error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function generatePlan(params: {
  goal: string, level: string, equipment: string,
  days_per_week: number, duration?: string, age?: string, weight?: string,
  target_weight?: string, height?: string
}) {
  const { goal, level, equipment, days_per_week, duration, age, weight, target_weight, height } = params

  const prompt = `Eres un preparador físico de élite. Genera un plan de entrenamiento y nutrición personalizado.

Cliente:
- Objetivo: ${goal}
- Nivel: ${level}
- Equipamiento: ${equipment}
- Días/semana: ${days_per_week}
- Tiempo disponible para el objetivo: ${duration || '12 semanas'}
- Edad: ${age || 'no especificada'} años
- Peso actual: ${weight || 'no especificado'} kg
- Peso objetivo: ${target_weight || 'no especificado'} kg
- Altura: ${height || 'no especificada'} cm

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "client_config": {
    "kcal_goal": <número de calorías diarias>,
    "protein_goal": <gramos de proteína diaria>,
    "steps_goal": <pasos diarios 7000-12000>,
    "cardio_goal_min": <minutos cardio semanal>,
    "plan_weeks": <semanas del plan 8-16>,
    "phase_name": "<nombre de fase>",
    "golden_rules": ["<regla 1>", "<regla 2>", "<regla 3>"]
  },
  "workout_days": [
    {
      "day_index": <0-6, únicos, exactamente ${days_per_week} entradas empezando en 0>,
      "title": "<nombre del día>",
      "duration": "<duración ej: 60 min>",
      "exercises": [
        {"name": "<nombre>", "sets_reps": "<ej: 4×8>", "note": "<consejo técnico breve>"}
      ]
    }
  ],
  "diet_plan": {
    "meals": [
      {
        "name": "<Desayuno/Comida/Merienda/Cena>",
        "icon": "<ti-coffee|ti-sun|ti-apple|ti-moon|ti-clock>",
        "foods": [
          {"name": "<alimento con cantidad>", "protein_g": <número>, "kcal": <número>}
        ]
      }
    ]
  },
  "supplements": [
    {"name": "<nombre>", "dose": "<dosis>", "protein_g": <número>, "kcal": <número>}
  ]
}

Reglas críticas:
- workout_days debe tener EXACTAMENTE ${days_per_week} entradas, day_index únicos consecutivos desde 0
- Ejercicios SOLO compatibles con: ${equipment}
- Suma de kcal de comidas debe aproximarse al kcal_goal
- Todo en español
- Devuelve SOLO el JSON, sin markdown, sin texto antes ni después`

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  })

  // 1 reintento tras 12s si es rate limit por minuto; cuota diaria falla al segundo intento igualmente
  let res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  )
  if (res.status === 429) {
    console.log('Gemini 429, retrying once after 12s...')
    await new Promise(r => setTimeout(r, 12000))
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Gemini HTTP error:', res.status, errText)
    if (res.status === 429) {
      throw new Error('El servicio de IA está saturado en este momento. Espera 1 minuto e inténtalo de nuevo.')
    }
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  console.log('Gemini finish reason:', data.candidates?.[0]?.finishReason)

  if (data.error) {
    console.error('Gemini API error:', JSON.stringify(data.error))
    throw new Error(`Gemini error: ${data.error.message}`)
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Prompt bloqueado: ${data.promptFeedback.blockReason}`)
  }

  const candidate = data.candidates?.[0]
  if (!candidate) {
    console.error('No candidates in Gemini response:', JSON.stringify(data))
    throw new Error('Gemini no devolvió candidatos')
  }

  if (candidate.finishReason === 'MAX_TOKENS') {
    console.error('Gemini hit MAX_TOKENS, partial response received')
    throw new Error('El plan generado es demasiado largo. Inténtalo de nuevo.')
  }

  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Respuesta bloqueada por filtros de seguridad')
  }

  const text = candidate.content?.parts?.[0]?.text
  if (!text) {
    console.error('No text in Gemini response:', JSON.stringify(candidate))
    throw new Error('Gemini devolvió respuesta vacía')
  }

  try {
    return JSON.parse(text)
  } catch {
    const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    try {
      return JSON.parse(clean)
    } catch (e) {
      console.error('JSON parse error. Text start:', text.slice(0, 300))
      throw new Error('Error parseando respuesta de Gemini. Inténtalo de nuevo.')
    }
  }
}
