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

    const { instruction } = await req.json()
    if (!instruction) return new Response(JSON.stringify({ error: 'instruction es requerida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const today = new Date().toISOString().split('T')[0]
    const prompt = `Extrae medidas corporales de este texto dictado por un trainer. Devuelve solo los campos mencionados.

TEXTO: "${instruction}"

CAMPOS DISPONIBLES:
- weight_kg, body_fat_pct, shoulder_cm, chest_cm, arm_r_cm, arm_l_cm
- waist_cm, hips_cm, thigh_r_cm, thigh_l_cm, calf_r_cm, calf_l_cm
- notes (texto libre), date (YYYY-MM-DD, default: ${today})

REGLAS: Solo incluye los campos mencionados explícitamente. Si no hay medidas válidas devuelve measurement: null.
Devuelve SOLO JSON válido.

FORMATO:
{"measurement": {"weight_kg": 80.5, "waist_cm": 85, "date": "${today}"}, "debug": "Se extrajeron X medidas"}
O si no hay medidas: {"measurement": null, "debug": "No se encontraron medidas en el texto"}`

    const result = await callWithFallback(prompt)
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ai-measures-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, measurement: null }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function callWithFallback(prompt: string) {
  try { return await callGemini(prompt) }
  catch (e) {
    console.warn('Gemini falló, usando Claude fallback:', (e as Error).message)
    try { return await callClaude(prompt) }
    catch (e2) { console.error('Claude fallback falló:', (e2 as Error).message); throw e }
  }
}

async function callGemini(prompt: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 } })
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
  return parseMeasurementResponse(text)
}

async function callClaude(prompt: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`Claude ${res.status}: ${t.slice(0, 100)}`) }
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Claude devolvió respuesta vacía')
  return parseMeasurementResponse(text)
}

function parseMeasurementResponse(text: string): { measurement: unknown; debug: string } {
  let parsed: { measurement?: unknown; debug?: string }
  try { parsed = JSON.parse(text) }
  catch { parsed = JSON.parse(text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()) }
  return { measurement: parsed.measurement || null, debug: parsed.debug || (parsed.measurement ? 'Medidas extraídas' : 'No se encontraron medidas') }
}
