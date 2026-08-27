-- Keep the offer-acceptance transition behind the authenticated server API.
-- TI-377 recreates the public wrapper after restricting the delegated helper;
-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless revoked.

revoke all on function public.offer_accept_v0(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.offer_accept_v0(uuid, uuid)
  to service_role;

