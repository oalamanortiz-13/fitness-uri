import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { instruction, plan } = await req.json()
    if (!instruction || !plan) {
      return new Response(JSON.stringify({ error: 'instruction y plan son requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await callGemini(instruction, plan)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('ai-plan-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, actions: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function callGemini(instruction: string, plan: unknown) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

  const planJson = JSON.stringify(plan, null, 2)

  const prompt = `Eres el editor de planes de entrenamiento de una app fitness. El trainer te da una instrucción en lenguaje natural y debes devolver las acciones exactas para modificar el plan.

PLAN ACTUAL (JSON):
${planJson}

INSTRUCCIÓN DEL TRAINER:
"${instruction}"

REGLAS:
- Usa los IDs exactos de los ejercicios del plan para editar o eliminar.
- Para añadir ejercicios, usa el day_index correcto del día mencionado.
- Si la instrucción menciona "todos los días" aplica la acción a cada día.
- Si no hay cambios claros que hacer, devuelve actions vacío con un mensaje en debug.
- Devuelve SOLO JSON válido, sin markdown.

TIPOS DE ACCIONES DISPONIBLES:
1. Añadir ejercicio:
   {"type":"add_exercise","day_index":0,"name":"Sentadilla","sets_reps":"4x8","note":"Espalda recta"}

2. Editar ejercicio (usa el id exacto del plan):
   {"type":"edit_exercise","exercise_id":"uuid-exacto","changes":{"sets_reps":"4x10","note":"nuevo consejo"}}
   (changes puede tener: name, sets_reps, note — solo los campos a cambiar)

3. Eliminar ejercicio (usa el id exacto del plan):
   {"type":"remove_exercise","exercise_id":"uuid-exacto"}

4. Actualizar día (título, duración o notas):
   {"type":"update_day","day_index":0,"changes":{"title":"Pierna","duration":"75 min","notes":"Enfocarse en técnica"}}

FORMATO DE RESPUESTA:
{
  "actions": [ ...array de acciones... ],
  "debug": "descripción breve de lo que se hará o por qué no hay acciones"
}`

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  })

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const RETRYABLE = new Set([429, 500, 502, 503, 504])
  const delays = [3000, 8000, 15000]
  let res!: Response

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (res.ok || !RETRYABLE.has(res.status)) break
    if (attempt < delays.length) {
      console.log(`Gemini ${res.status} intento ${attempt + 1}, reintentando en ${delays[attempt]}ms...`)
      await new Promise(r => setTimeout(r, delays[attempt]))
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Gemini error:', res.status, errText.slice(0, 300))
    if (res.status === 429) throw new Error('IA saturada. Espera un momento e inténtalo de nuevo.')
    throw new Error(`Error de IA (${res.status})`)
  }

  const data = await res.json()
  console.log('Gemini finish reason:', data.candidates?.[0]?.finishReason)

  if (data.error) throw new Error(`Gemini: ${data.error.message}`)
  if (data.promptFeedback?.blockReason) throw new Error(`Prompt bloqueado: ${data.promptFeedback.blockReason}`)

  const candidate = data.candidates?.[0]
  if (!candidate) throw new Error('Gemini no devolvió candidatos')
  if (candidate.finishReason === 'MAX_TOKENS') throw new Error('Respuesta demasiado larga. Simplifica la instrucción.')
  if (candidate.finishReason === 'SAFETY') throw new Error('Respuesta bloqueada por filtros de seguridad')

  const text = candidate.content?.parts?.[0]?.text
  if (!text) {
    console.error('Gemini respuesta vacía:', JSON.stringify(candidate))
    throw new Error('Gemini devolvió respuesta vacía')
  }

  let parsed: { actions?: unknown[]; debug?: string }
  try {
    parsed = JSON.parse(text)
  } catch {
    const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('JSON parse error. Texto recibido:', text.slice(0, 500))
      return { actions: [], debug: 'Gemini devolvió JSON inválido. Raw: ' + text.slice(0, 200) }
    }
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : []
  const debug = parsed.debug || (actions.length === 0 ? 'No se identificaron cambios para esa instrucción' : `${actions.length} acción(es) generadas`)

  return { actions, debug }
}
