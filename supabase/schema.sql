-- ============================================================
-- FITNESS URI — Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- PROFILES (base para todos los usuarios)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'trainer', 'client')),
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRAINERS
CREATE TABLE IF NOT EXISTS trainers (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  bio TEXT,
  specialty TEXT,
  max_clients INT DEFAULT 20
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  age INT,
  height_cm FLOAT,
  weight_start FLOAT,
  weight_goal TEXT,
  kcal_goal INT DEFAULT 2500,
  protein_goal INT DEFAULT 175,
  steps_goal INT DEFAULT 9000,
  cardio_goal_min INT DEFAULT 185,
  plan_start_date DATE,
  plan_weeks INT DEFAULT 12,
  phase_name TEXT DEFAULT 'Fase 1',
  notes TEXT,
  golden_rules TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT TRUE
);

-- WORKOUT DAYS (un día de entreno, 0=Lun … 6=Dom)
CREATE TABLE IF NOT EXISTS workout_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  day_index INT NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  title TEXT NOT NULL,
  duration TEXT,
  order_index INT DEFAULT 0,
  UNIQUE(client_id, day_index)
);

-- WORKOUT EXERCISES
CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_day_id UUID REFERENCES workout_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets_reps TEXT NOT NULL,
  note TEXT,
  order_index INT DEFAULT 0
);

-- DIET PLANS
CREATE TABLE IF NOT EXISTS diet_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT DEFAULT 'Plan principal',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DIET MEALS (Desayuno, Comida, Merienda, Cena...)
CREATE TABLE IF NOT EXISTS diet_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_plan_id UUID REFERENCES diet_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'ti-coffee',
  order_index INT DEFAULT 0
);

-- DIET FOODS (opciones dentro de cada comida)
CREATE TABLE IF NOT EXISTS diet_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_meal_id UUID REFERENCES diet_meals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protein_g INT DEFAULT 0,
  kcal INT DEFAULT 0,
  order_index INT DEFAULT 0
);

-- SUPPLEMENTS
CREATE TABLE IF NOT EXISTS supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT,
  protein_g INT DEFAULT 0,
  kcal INT DEFAULT 0,
  order_index INT DEFAULT 0
);

-- DAILY LOGS (registro diario del cliente)
CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg FLOAT,
  steps INT DEFAULT 0,
  cardio_min INT DEFAULT 0,
  rpe INT CHECK (rpe BETWEEN 1 AND 10),
  checklist JSONB DEFAULT '{}',
  exercises_done UUID[] DEFAULT '{}',
  loads JSONB DEFAULT '{}',
  foods_checked UUID[] DEFAULT '{}',
  calendar_status TEXT CHECK (calendar_status IN ('done', 'miss')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, log_date)
);

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- ─── POLICIES: profiles ────────────────────────────────────────────────────────
CREATE POLICY "User reads own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admin reads all profiles" ON profiles
  FOR SELECT USING (get_my_role() = 'admin');

CREATE POLICY "System inserts profile" ON profiles
  FOR INSERT WITH CHECK (true); -- el trigger insert como SECURITY DEFINER

-- ─── POLICIES: trainers ────────────────────────────────────────────────────────
CREATE POLICY "Trainer reads own trainer record" ON trainers
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admin full access trainers" ON trainers
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: clients ─────────────────────────────────────────────────────────
CREATE POLICY "Client reads own data" ON clients
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Trainer reads and manages own clients" ON clients
  FOR ALL USING (trainer_id = auth.uid());

CREATE POLICY "Admin full access clients" ON clients
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: workout_days ────────────────────────────────────────────────────
CREATE POLICY "Client reads own workouts" ON workout_days
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Trainer manages client workouts" ON workout_days
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
  );

CREATE POLICY "Admin full access workout_days" ON workout_days
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: workout_exercises ──────────────────────────────────────────────
CREATE POLICY "Client reads own exercises" ON workout_exercises
  FOR SELECT USING (
    workout_day_id IN (SELECT id FROM workout_days WHERE client_id = auth.uid())
  );

CREATE POLICY "Trainer manages exercises" ON workout_exercises
  FOR ALL USING (
    workout_day_id IN (
      SELECT wd.id FROM workout_days wd
      JOIN clients c ON c.id = wd.client_id
      WHERE c.trainer_id = auth.uid()
    )
  );

CREATE POLICY "Admin full access exercises" ON workout_exercises
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: diet_plans ──────────────────────────────────────────────────────
CREATE POLICY "Client reads own diet" ON diet_plans
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Trainer manages client diet" ON diet_plans
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
  );

CREATE POLICY "Admin full access diet_plans" ON diet_plans
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: diet_meals ──────────────────────────────────────────────────────
CREATE POLICY "Client reads own meals" ON diet_meals
  FOR SELECT USING (
    diet_plan_id IN (SELECT id FROM diet_plans WHERE client_id = auth.uid())
  );

CREATE POLICY "Trainer manages meals" ON diet_meals
  FOR ALL USING (
    diet_plan_id IN (
      SELECT dp.id FROM diet_plans dp
      JOIN clients c ON c.id = dp.client_id
      WHERE c.trainer_id = auth.uid()
    )
  );

CREATE POLICY "Admin full access diet_meals" ON diet_meals
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: diet_foods ──────────────────────────────────────────────────────
CREATE POLICY "Client reads own foods" ON diet_foods
  FOR SELECT USING (
    diet_meal_id IN (
      SELECT dm.id FROM diet_meals dm
      JOIN diet_plans dp ON dp.id = dm.diet_plan_id
      WHERE dp.client_id = auth.uid()
    )
  );

CREATE POLICY "Trainer manages foods" ON diet_foods
  FOR ALL USING (
    diet_meal_id IN (
      SELECT dm.id FROM diet_meals dm
      JOIN diet_plans dp ON dp.id = dm.diet_plan_id
      JOIN clients c ON c.id = dp.client_id
      WHERE c.trainer_id = auth.uid()
    )
  );

CREATE POLICY "Admin full access diet_foods" ON diet_foods
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: supplements ────────────────────────────────────────────────────
CREATE POLICY "Client reads own supplements" ON supplements
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Trainer manages supplements" ON supplements
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
  );

CREATE POLICY "Admin full access supplements" ON supplements
  FOR ALL USING (get_my_role() = 'admin');

-- ─── POLICIES: daily_logs ─────────────────────────────────────────────────────
CREATE POLICY "Client manages own logs" ON daily_logs
  FOR ALL USING (client_id = auth.uid());

CREATE POLICY "Trainer reads client logs" ON daily_logs
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
  );

CREATE POLICY "Admin full access logs" ON daily_logs
  FOR ALL USING (get_my_role() = 'admin');

-- ─── TRIGGER: crear profile al registrar usuario ───────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_role TEXT;
  user_name TEXT;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client');
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO profiles (id, role, full_name, email)
  VALUES (NEW.id, user_role, user_name, COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;

  -- Si es trainer, crear entrada en trainers
  IF user_role = 'trainer' THEN
    INSERT INTO trainers (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── CREAR PRIMER ADMIN MANUALMENTE ──────────────────────────────────────────
-- Después de ejecutar este SQL, ve a Authentication → Users → Invite user
-- Crea el admin con email y en "User Metadata" añade:
-- { "role": "admin", "full_name": "Tu nombre" }
-- El trigger creará automáticamente el registro en profiles con role='admin'
