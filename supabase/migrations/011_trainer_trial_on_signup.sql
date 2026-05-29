-- Update handle_new_user trigger to set trial_ends_at and specialty on trainer creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;

  IF COALESCE(NEW.raw_user_meta_data->>'role', 'client') = 'trainer' THEN
    INSERT INTO public.trainers (id, specialty, trial_ends_at)
    VALUES (
      NEW.id,
      NULLIF(NEW.raw_user_meta_data->>'specialty', ''),
      NOW() + INTERVAL '14 days'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
