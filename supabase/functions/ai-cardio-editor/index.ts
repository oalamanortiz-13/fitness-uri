import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CARDIO_TYPE_IDS = ['correr','caminar','cinta','eliptica','bici','spinning','remo','natacion','escaladora','comba','hiit','boxing','step','senderismo']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { instruction, context } = await req.json()
    if (!instruction) return new Response(JSON.stringify({ error: 'instruction es requerida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const prompt = `Eres el editor de configuración de cardio de una app fitness.

CONFIGURACIÓN ACTUAL:
${JSON.stringify(context, null, 2)}

TIPOS DE CARDIO DISPONIBLES: ${CARDIO_TYPE_IDS.join(', ')}

INSTRUCCIÓN: "${instruction}"

TIPOS DE ACCIONES:
1. Cambiar objetivo de pasos: {"type":"set_steps_goal","value":10000}
2. Cambiar objetivo de cardio (minutos/semana): {"type":"set_cardio_goal","value":180}
3. Cambiar recordatorio anti-sedentarismo (minutos, null para desactivar): {"type":"set_reminder","value":45}
4. Cambiar tipos de cardio asignados: {"type":"set_cardio_types","types":["correr","bici"]}

Devuelve SOLO JSON válido. FORMATO: {"actions":[...], "debug":"descripción breve"}`

    const result = await callWithFallback(prompt, 2048)
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ai-cardio-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, actions: [] }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function callWithFallback(prompt: string, maxTokens: number) {
  try { return await callGemini(prompt, maxTokens) }
  catch (e) {
    console.warn('Gemini falló, usando Claude fallback:', (e as Error).message)
    try { return await callClaude(prompt, maxTokens) }
    catch (e2) { console.error('Claude fallback falló:', (e2 as Error).message); throw e }
  }
}

async function callGemini(prompt: string, maxTokens: number) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: maxTokens } })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const RETRYABLE = new Set([429, 500, 502, 503, 504])
  const delays = [3000, 8000, 15000]
  let res!: Response
  for (let i = 0; i <= delays.length; i++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (res.ok || !RETRYABLE.has(res.status)) break
    if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]))
  }
  if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t.slice(0, 100)}`) }
  const data = await res.json()
  if (data.error) throw new Error(`Gemini: ${data.error.message}`)
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini devolvió respuesta vacía')
  return parseJsonResponse(text)
}

async function callClaude(prompt: string, maxTokens: number) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: Math.min(maxTokens, 4096), messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`Claude ${res.status}: ${t.slice(0, 100)}`) }
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Claude devolvió respuesta vacía')
  return parseJsonResponse(text)
}

function parseJsonResponse(text: string): { actions: unknown[]; debug: string } {
  let parsed: { actions?: unknown[]; debug?: string }
  try { parsed = JSON.parse(text) }
  catch { parsed = JSON.parse(text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()) }
  const actions = Array.isArray(parsed.actions) ? parsed.actions : []
  return { actions, debug: parsed.debug || (actions.length === 0 ? 'No se identificaron cambios' : `${actions.length} acción(es)`) }
}
