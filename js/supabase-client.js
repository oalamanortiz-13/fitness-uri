import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Sustituir con los valores reales de tu proyecto Supabase:
// Settings → API → Project URL y anon public key
const SUPABASE_URL = 'REEMPLAZAR_CON_TU_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'REEMPLAZAR_CON_TU_SUPABASE_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
