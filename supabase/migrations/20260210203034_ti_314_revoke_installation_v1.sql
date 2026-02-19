-- Compatibility no-op for hosted migration history alignment.
--
-- The TI-314 base function body moved earlier to:
--   20260210190034_ti_314_revoke_installation_v1.sql
-- so TI-314/TI-315 patch migrations remain the final authoritative definitions.

do $$
begin
  null;
end
$$;
