-- Keep the privileged approval side-effect handler trigger-only. PostgreSQL
-- grants EXECUTE on new functions to PUBLIC by default, which exposes a
-- SECURITY DEFINER function through the Data API unless it is revoked.

revoke all on function public.approvals_apply_side_effects_v1()
  from public, anon, authenticated;

grant execute on function public.approvals_apply_side_effects_v1()
  to service_role;
