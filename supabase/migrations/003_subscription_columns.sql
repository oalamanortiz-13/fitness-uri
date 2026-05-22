-- Migration 003: Columnas de suscripción en trainers
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'unpaid'));
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
  DEFAULT NOW() + INTERVAL '14 days';
