-- TI-314: Atomic installation revocation (Connected Apps), bootstrap-safe base.
--
-- NOTE:
-- This file is intentionally kept before TI-314/TI-315 patch migrations in version order.
-- It already contains the qualified predicates and refresh-token revocation logic so that
-- replay on fresh databases and partial-hosted histories converges to safe semantics.
--
-- Revoke semantics:
-- - Owner can revoke an installation, which marks `agent_installations.status=REVOKED`
-- - All installation-scoped API keys (ACTIVE/GRACE) are revoked (key_state=REVOKED)
-- - All OAuth refresh tokens for that installation are revoked (revoked_at set)
--
-- Called from backend using service role; direct PostgREST access is denied by RLS.

create or replace function public.revoke_installation_v1(
  p_installation_id uuid,
  p_owner_id uuid,
  p_now timestamptz default now()
)
returns table (
  installation_id uuid,
  status agent_installation_status,
  revoked_at timestamptz,
  revoked_keys_count integer
)
language plpgsql
as $$
declare
  installation_row public.agent_installations%rowtype;
  v_now timestamptz := coalesce(p_now, now());
  v_revoked_at timestamptz;
  v_revoked_keys int := 0;
begin
  if p_installation_id is null then
    raise exception 'VALIDATION_ERROR:INSTALLATION_ID';
  end if;

  if p_owner_id is null then
    raise exception 'VALIDATION_ERROR:OWNER_ID';
  end if;

  select *
    into installation_row
    from public.agent_installations as ai
   where ai.installation_id = p_installation_id
   for update;

  if not found then
    raise exception 'INSTALLATION_NOT_FOUND';
  end if;

  -- Fail closed: do not leak whether the installation exists to other owners.
  if installation_row.owner_id is distinct from p_owner_id then
    raise exception 'INSTALLATION_NOT_FOUND';
  end if;

  v_revoked_at := coalesce(installation_row.revoked_at, v_now);

  update public.agent_installations as ai
     set status = 'REVOKED'::agent_installation_status,
         revoked_at = v_revoked_at
   where ai.installation_id = installation_row.installation_id;

  update public.api_keys as ak
     set key_state = 'REVOKED',
         revoked_at = v_revoked_at,
         grace_expires_at = null
   where ak.installation_id = installation_row.installation_id
     and ak.key_state in ('ACTIVE', 'GRACE');

  get diagnostics v_revoked_keys = row_count;

  update public.oauth_refresh_tokens as ort
     -- Ensure `revoked_at >= created_at` (see oauth_refresh_tokens_revoked_after_created_check),
     -- even if a refresh token was created slightly after the installation's revoke timestamp.
     set revoked_at = greatest(v_revoked_at, ort.created_at)
   where ort.installation_id = installation_row.installation_id
     and ort.revoked_at is null;

  return query
    select installation_row.installation_id,
           'REVOKED'::agent_installation_status,
           v_revoked_at,
           v_revoked_keys;
end;
$$;

-- Supabase security lint: pin function search_path explicitly.
alter function public.revoke_installation_v1(uuid, uuid, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;
