-- Compatibility no-op for hosted migration history alignment.
--
-- The TI-313 schema body moved earlier to:
--   20260210190012_ti_313_oauth_tokens_v0.sql
-- to satisfy dependency ordering for fresh replay.

do $$
begin
  null;
end
$$;
