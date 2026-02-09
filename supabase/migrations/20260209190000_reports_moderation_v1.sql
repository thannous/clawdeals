-- TI-273: Reports moderation workflow v1
-- Add resolution columns and indexes to reports table

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS resolved_by   uuid,
  ADD COLUMN IF NOT EXISTS resolved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_reason text;

CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_entity_type_status_idx
  ON public.reports (entity_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reason_code_idx
  ON public.reports (reason_code, created_at DESC);
