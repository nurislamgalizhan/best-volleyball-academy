CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_users (
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  site TEXT NOT NULL CHECK (site IN ('MERCURY', 'BVA')),
  local_user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, site),
  UNIQUE (site, local_user_id)
);

CREATE TABLE IF NOT EXISTS shared_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  origin_site TEXT NOT NULL CHECK (origin_site IN ('MERCURY', 'BVA')),
  origin_local_subscription_id INTEGER,
  plan JSONB NOT NULL,
  visits_balance INTEGER NOT NULL DEFAULT 0,
  subscription_end TIMESTAMPTZ NOT NULL,
  frozen_until TIMESTAMPTZ,
  freeze_started_at TIMESTAMPTZ,
  freeze_days_used INTEGER NOT NULL DEFAULT 0,
  freeze_days_reserved INTEGER NOT NULL DEFAULT 0,
  freeze_until_manual BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REFUNDED', 'CANCELLED')),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origin_site, origin_local_subscription_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_subscriptions_one_live_per_member
  ON shared_subscriptions(member_id)
  WHERE status IN ('PENDING', 'ACTIVE');

CREATE TABLE IF NOT EXISTS shared_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES shared_subscriptions(id) ON DELETE CASCADE,
  source_site TEXT NOT NULL CHECK (source_site IN ('MERCURY', 'BVA')),
  visits_deducted INTEGER NOT NULL CHECK (visits_deducted > 0),
  guest_count INTEGER NOT NULL DEFAULT 0 CHECK (guest_count >= 0),
  actor_label TEXT,
  is_admin_action BOOLEAN NOT NULL DEFAULT false,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES shared_subscriptions(id) ON DELETE CASCADE,
  source_site TEXT NOT NULL CHECK (source_site IN ('MERCURY', 'BVA')),
  actor_label TEXT,
  action_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commands (
  idempotency_key TEXT PRIMARY KEY,
  source_site TEXT NOT NULL,
  command_type TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projection_jobs (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('MEMBER', 'SUBSCRIPTION', 'VISIT', 'ACTION')),
  entity_id UUID NOT NULL,
  target_site TEXT NOT NULL CHECK (target_site IN ('MERCURY', 'BVA')),
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, entity_id, target_site, version)
);

CREATE INDEX IF NOT EXISTS projection_jobs_pending_idx
  ON projection_jobs(status, next_attempt_at);
