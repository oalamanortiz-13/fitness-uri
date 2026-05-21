import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Sustituir con los valores reales de tu proyecto Supabase:
// Settings → API → Project URL y anon public key
const SUPABASE_URL = 'https://cwwvwrzqlavuyqhyeepu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3d3Z3cnpxbGF2dXlxaHllZXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzUwMzEsImV4cCI6MjA5NDk1MTAzMX0.-u2EaLh9A_CfKIr1N4XZ5WTukTEr3P4otkxu7lFY9ek'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
