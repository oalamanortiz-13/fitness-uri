-- ============================================================
-- 011_ai_trainer — Cuenta sistema "Tu Preparador IA"
-- Trainer virtual asignado a clientes self-service (sin preparador humano)
-- UUID fijo: 00000000-0000-0000-0000-000000000001
-- ============================================================

DO $$
BEGIN

-- 1. Insertar en auth.users (si no existe)
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  is_super_admin,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'ai@tupreparador.es',
  crypt('ai-trainer-system-' || gen_random_uuid()::text, gen_salt('bf')),
  NOW(), NOW(), NOW(),
  FALSE,
  '{"provider":"email","providers":["email"]}',
  '{"role":"trainer","full_name":"Tu Preparador IA"}'
) ON CONFLICT (id) DO NOTHING;

-- 2. Insertar en profiles
INSERT INTO profiles (id, role, full_name, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'trainer',
  'Tu Preparador IA',
  'ai@tupreparador.es'
) ON CONFLICT (id) DO NOTHING;

-- 3. Insertar en trainers (subscription_status active para que no bloquee)
INSERT INTO trainers (id, bio, specialty, max_clients, subscription_status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Tu entrenador personal potenciado por inteligencia artificial.',
  'IA · Entrenamiento personalizado',
  99999,
  'active'
) ON CONFLICT (id) DO NOTHING;

END $$;
