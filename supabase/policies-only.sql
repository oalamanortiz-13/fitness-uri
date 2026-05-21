-- ============================================================
-- FITNESS URI — Solo policies + trigger (sin CREATE TABLE)
-- Ejecutar esto si el schema.sql ya fue ejecutado parcialmente
-- ============================================================

-- Borrar policies existentes para poder recrearlas
DROP POLICY IF EXISTS "User reads own profile" ON profiles;
DROP POLICY IF EXISTS "Admin reads all profiles" ON profiles;
DROP POLICY IF EXISTS "System inserts profile" ON profiles;
DROP POLICY IF EXISTS "Trainer reads own trainer record" ON trainers;
DROP POLICY IF EXISTS "Admin full access trainers" ON trainers;
DROP POLICY IF EXISTS "Client reads own data" ON clients;
DROP POLICY IF EXISTS "Trainer reads and manages own clients" ON clients;
DROP POLICY IF EXISTS "Admin full access clients" ON clients;
DROP POLICY IF EXISTS "Client reads own workouts" ON workout_days;
DROP POLICY IF EXISTS "Trainer manages client workouts" ON workout_days;
DROP POLICY IF EXISTS "Admin full access workout_days" ON workout_days;
DROP POLICY IF EXISTS "Client reads own exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Trainer manages exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Admin full access exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Client reads own diet" ON diet_plans;
DROP POLICY IF EXISTS "Trainer manages client diet" ON diet_plans;
DROP POLICY IF EXISTS "Admin full access diet_plans" ON diet_plans;
DROP POLICY IF EXISTS "Client reads own meals" ON diet_meals;
DROP POLICY IF EXISTS "Trainer manages meals" ON diet_meals;
DROP POLICY IF EXISTS "Admin full access diet_meals" ON diet_meals;
DROP POLICY IF EXISTS "Client reads own foods" ON diet_foods;
DROP POLICY IF EXISTS "Trainer manages foods" ON diet_foods;
DROP POLICY IF EXISTS "Admin full access diet_foods" ON diet_foods;
DROP POLICY IF EXISTS "Client reads own supplements" ON supplements;
DROP POLICY IF EXISTS "Trainer manages supplements" ON supplements;
DROP POLICY IF EXISTS "Admin full access supplements" ON supplements;
DROP POLICY IF EXISTS "Client manages own logs" ON daily_logs;
DROP POLICY IF EXISTS "Trainer reads client logs" ON daily_logs;
DROP POLICY IF EXISTS "Admin full access logs" ON daily_logs;

-- Helper: obtener rol
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- POLICIES: profiles
CREATE POLICY "User reads own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin reads all profiles" ON profiles FOR SELECT USING (get_my_role() = 'admin');
CREATE POLICY "System inserts profile" ON profiles FOR INSERT WITH CHECK (true);

-- POLICIES: trainers
CREATE POLICY "Trainer reads own trainer record" ON trainers FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin full access trainers" ON trainers FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: clients
CREATE POLICY "Client reads own data" ON clients FOR SELECT USING (id = auth.uid());
CREATE POLICY "Trainer reads and manages own clients" ON clients FOR ALL USING (trainer_id = auth.uid());
CREATE POLICY "Admin full access clients" ON clients FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: workout_days
CREATE POLICY "Client reads own workouts" ON workout_days FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Trainer manages client workouts" ON workout_days FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
);
CREATE POLICY "Admin full access workout_days" ON workout_days FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: workout_exercises
CREATE POLICY "Client reads own exercises" ON workout_exercises FOR SELECT USING (
  workout_day_id IN (SELECT id FROM workout_days WHERE client_id = auth.uid())
);
CREATE POLICY "Trainer manages exercises" ON workout_exercises FOR ALL USING (
  workout_day_id IN (
    SELECT wd.id FROM workout_days wd JOIN clients c ON c.id = wd.client_id WHERE c.trainer_id = auth.uid()
  )
);
CREATE POLICY "Admin full access exercises" ON workout_exercises FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: diet_plans
CREATE POLICY "Client reads own diet" ON diet_plans FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Trainer manages client diet" ON diet_plans FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
);
CREATE POLICY "Admin full access diet_plans" ON diet_plans FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: diet_meals
CREATE POLICY "Client reads own meals" ON diet_meals FOR SELECT USING (
  diet_plan_id IN (SELECT id FROM diet_plans WHERE client_id = auth.uid())
);
CREATE POLICY "Trainer manages meals" ON diet_meals FOR ALL USING (
  diet_plan_id IN (
    SELECT dp.id FROM diet_plans dp JOIN clients c ON c.id = dp.client_id WHERE c.trainer_id = auth.uid()
  )
);
CREATE POLICY "Admin full access diet_meals" ON diet_meals FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: diet_foods
CREATE POLICY "Client reads own foods" ON diet_foods FOR SELECT USING (
  diet_meal_id IN (
    SELECT dm.id FROM diet_meals dm JOIN diet_plans dp ON dp.id = dm.diet_plan_id WHERE dp.client_id = auth.uid()
  )
);
CREATE POLICY "Trainer manages foods" ON diet_foods FOR ALL USING (
  diet_meal_id IN (
    SELECT dm.id FROM diet_meals dm
    JOIN diet_plans dp ON dp.id = dm.diet_plan_id
    JOIN clients c ON c.id = dp.client_id
    WHERE c.trainer_id = auth.uid()
  )
);
CREATE POLICY "Admin full access diet_foods" ON diet_foods FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: supplements
CREATE POLICY "Client reads own supplements" ON supplements FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Trainer manages supplements" ON supplements FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
);
CREATE POLICY "Admin full access supplements" ON supplements FOR ALL USING (get_my_role() = 'admin');

-- POLICIES: daily_logs
CREATE POLICY "Client manages own logs" ON daily_logs FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Trainer reads client logs" ON daily_logs FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid())
);
CREATE POLICY "Admin full access logs" ON daily_logs FOR ALL USING (get_my_role() = 'admin');

-- TRIGGER
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
