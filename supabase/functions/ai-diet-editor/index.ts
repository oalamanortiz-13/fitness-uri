import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { instruction, plan } = await req.json()
    if (!instruction || !plan) return new Response(JSON.stringify({ error: 'instruction y plan son requeridos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const result = await callGemini(instruction, plan)
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ai-diet-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, actions: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function callGemini(instruction: string, plan: unknown) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

  const prompt = `Eres el editor de planes de nutrición de una app fitness. El trainer te da una instrucción y debes devolver las acciones para modificar el plan de dieta.

PLAN DE DIETA ACTUAL (JSON):
${JSON.stringify(plan, null, 2)}

INSTRUCCIÓN DEL TRAINER:
"${instruction}"

TIPOS DE ACCIONES:
1. Añadir comida: {"type":"add_meal","name":"Desayuno","icon":"ti-coffee"}
2. Añadir alimento (usa meal_id del plan): {"type":"add_food","meal_id":"uuid","meal_name":"Desayuno","name":"Huevos revueltos 200g","kcal":300,"protein_g":25}
3. Editar alimento: {"type":"edit_food","food_id":"uuid","changes":{"name":"nuevo nombre","kcal":200,"protein_g":20}}
4. Eliminar alimento: {"type":"remove_food","food_id":"uuid"}
5. Renombrar comida: {"type":"rename_meal","meal_id":"uuid","name":"nuevo nombre"}
6. Eliminar comida: {"type":"remove_meal","meal_id":"uuid"}

REGLAS:
- Usa los IDs exactos del plan para editar o eliminar.
- Para add_food puedes usar meal_id o meal_name (el nombre exacto de la comida).
- Devuelve SOLO JSON válido, sin markdown.

FORMATO:
{"actions":[...], "debug":"descripción breve"}`

  return await geminiRequest(apiKey, prompt)
}

async function geminiRequest(apiKey: string, prompt: string) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 8192 },
  })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const RETRYABLE = new Set([429, 500, 502, 503, 504])
  const delays = [3000, 8000, 15000]
  let res!: Response

  for (let i = 0; i <= delays.length; i++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (res.ok || !RETRYABLE.has(res.status)) break
    if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]))
  }

  if (!res.ok) {
    const t = await res.text()
    if (res.status === 429) throw new Error('IA saturada. Espera un momento e inténtalo de nuevo.')
    throw new Error(`Error de IA (${res.status}): ${t.slice(0, 100)}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(`Gemini: ${data.error.message}`)
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { actions: [], debug: 'Gemini devolvió respuesta vacía' }

  let parsed: { actions?: unknown[]; debug?: string }
  try { parsed = JSON.parse(text) }
  catch { parsed = JSON.parse(text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()) }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : []
  return { actions, debug: parsed.debug || (actions.length === 0 ? 'No se identificaron cambios' : `${actions.length} acción(es)`) }
}
