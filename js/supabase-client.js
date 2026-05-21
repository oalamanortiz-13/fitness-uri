import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Sustituir con los valores reales de tu proyecto Supabase:
// Settings → API → Project URL y anon public key
const SUPABASE_URL = 'https://cwwvwrzqlavuyqhyeepu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_vk4fTp9nhHJL40yELC23Rw_cSjSbcEw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
