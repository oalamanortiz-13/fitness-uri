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

    const prompt = buildPrompt(instruction, plan)
    const result = await callWithFallback(prompt, 8192)

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ai-plan-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, actions: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function buildPrompt(instruction: string, plan: unknown): string {
  return `Eres el editor de planes de entrenamiento de una app fitness. El trainer te da una instrucción en lenguaje natural y debes devolver las acciones exactas para modificar el plan.

PLAN ACTUAL (JSON):
${JSON.stringify(plan, null, 2)}

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
}

async function callWithFallback(prompt: string, maxTokens: number) {
  try {
    return await callGemini(prompt, maxTokens)
  } catch (geminiErr) {
    console.warn('Gemini falló, usando Claude fallback:', (geminiErr as Error).message)
    try {
      return await callClaude(prompt, maxTokens)
    } catch (claudeErr) {
      console.error('Claude fallback también falló:', (claudeErr as Error).message)
      throw geminiErr
    }
  }
}

async function callGemini(prompt: string, maxTokens: number) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: maxTokens },
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
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 100)}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(`Gemini: ${data.error.message}`)

  const candidate = data.candidates?.[0]
  if (!candidate) throw new Error('Gemini no devolvió candidatos')
  if (candidate.finishReason === 'MAX_TOKENS') throw new Error('Respuesta demasiado larga. Simplifica la instrucción.')
  if (candidate.finishReason === 'SAFETY') throw new Error('Respuesta bloqueada por filtros de seguridad')

  const text = candidate.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini devolvió respuesta vacía')

  return parseJsonResponse(text)
}

async function callClaude(prompt: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(maxTokens, 4096),
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Claude error ${res.status}: ${t.slice(0, 100)}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Claude devolvió respuesta vacía')

  return parseJsonResponse(text)
}

function parseJsonResponse(text: string): { actions: unknown[]; debug: string } {
  let parsed: { actions?: unknown[]; debug?: string }
  try { parsed = JSON.parse(text) }
  catch {
    const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    try { parsed = JSON.parse(clean) }
    catch {
      console.error('JSON parse error. Texto:', text.slice(0, 300))
      return { actions: [], debug: 'Error parseando respuesta de IA. Raw: ' + text.slice(0, 200) }
    }
  }
  const actions = Array.isArray(parsed.actions) ? parsed.actions : []
  return { actions, debug: parsed.debug || (actions.length === 0 ? 'No se identificaron cambios' : `${actions.length} acción(es) generadas`) }
}
