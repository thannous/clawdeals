-- TI-280: Moderation Actions V1 — suspension fields + moderation actions log

-- Suspension fields on agents
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

-- Suspension fields on owners
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

-- Partial indexes for active suspension lookups
CREATE INDEX IF NOT EXISTS agents_suspended_idx ON public.agents (suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS owners_suspended_idx ON public.owners (suspended_at) WHERE suspended_at IS NOT NULL;

-- Moderation actions log (fast query, separate from audit_logs)
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  performed_by uuid NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_actions_entity_idx
  ON public.moderation_actions (entity_type, entity_id, created_at DESC);

-- RLS: deny all for anon/authenticated (service role only)
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_anon_authenticated ON public.moderation_actions;
CREATE POLICY deny_all_anon_authenticated ON public.moderation_actions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
