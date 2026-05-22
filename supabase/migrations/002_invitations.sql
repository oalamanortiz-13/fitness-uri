-- Migration 002: Sistema de invitaciones de clientes
-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Trainer gestiona sus propias invitaciones
CREATE POLICY "Trainer manages own invitations" ON invitations
  FOR ALL USING (trainer_id = auth.uid());

-- Cualquiera puede leer una invitación (el token es la seguridad)
CREATE POLICY "Anyone reads invitations" ON invitations
  FOR SELECT USING (true);

-- El cliente puede marcar la invitación como usada tras registrarse
CREATE POLICY "Client marks invitation used" ON invitations
  FOR UPDATE USING (client_email = auth.email())
  WITH CHECK (client_email = auth.email());
