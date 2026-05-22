-- Migration 001: Políticas para auto-registro de trainers
-- Ejecutar en Supabase → SQL Editor

-- Trainer puede actualizar su propio perfil (nombre, email)
CREATE POLICY "Trainer updates own profile" ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Trainer puede actualizar su propio registro (especialidad, bio)
CREATE POLICY "Trainer updates own trainer record" ON trainers
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Trainer puede insertar su propio registro si el trigger no lo hizo aún
CREATE POLICY "Trainer inserts own trainer record" ON trainers
  FOR INSERT WITH CHECK (id = auth.uid());
