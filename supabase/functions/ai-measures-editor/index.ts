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

    const result = await callGemini(instruction)
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('ai-measures-editor error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message, measurement: null }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function callGemini(instruction: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

  const today = new Date().toISOString().split('T')[0]

  const prompt = `Extrae medidas corporales de este texto dictado por un trainer. Devuelve solo los campos mencionados.

TEXTO: "${instruction}"

CAMPOS DISPONIBLES (todos en cm o %, según se indica):
- weight_kg: peso en kg
- body_fat_pct: % grasa corporal
- shoulder_cm: hombros (cm)
- chest_cm: pecho (cm)
- arm_r_cm: brazo derecho (cm)
- arm_l_cm: brazo izquierdo (cm)
- waist_cm: cintura (cm)
- hips_cm: cadera (cm)
- thigh_r_cm: muslo derecho (cm)
- thigh_l_cm: muslo izquierdo (cm)
- calf_r_cm: gemelo derecho (cm)
- calf_l_cm: gemelo izquierdo (cm)
- notes: notas adicionales (texto)
- date: fecha en formato YYYY-MM-DD (si se menciona, si no usa ${today})

REGLAS:
- Solo incluye los campos que se mencionan explícitamente en el texto.
- Si no se menciona ninguna medida válida, devuelve measurement: null con debug explicativo.
- Devuelve SOLO JSON válido.

FORMATO:
{
  "measurement": { "weight_kg": 80.5, "waist_cm": 85, "date": "${today}" },
  "debug": "Se extrajeron X medidas"
}
O si no hay medidas: {"measurement": null, "debug": "No se encontraron medidas en el texto"}`

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
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
  if (!text) return { measurement: null, debug: 'Gemini devolvió respuesta vacía' }

  let parsed: { measurement?: unknown; debug?: string }
  try { parsed = JSON.parse(text) }
  catch { parsed = JSON.parse(text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()) }

  return {
    measurement: parsed.measurement || null,
    debug: parsed.debug || (parsed.measurement ? 'Medidas extraídas' : 'No se encontraron medidas'),
  }
}
