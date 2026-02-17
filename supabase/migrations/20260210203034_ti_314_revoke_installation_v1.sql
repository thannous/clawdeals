-- TI-314: Atomic installation revocation (Connected Apps).
--
-- Revoke semantics:
-- - Owner can revoke an installation, which marks `agent_installations.status=REVOKED`
-- - All installation-scoped API keys (ACTIVE/GRACE) are revoked (key_state=REVOKED)
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
    from public.agent_installations ai
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

  update public.agent_installations
     set status = 'REVOKED'::agent_installation_status,
         revoked_at = v_revoked_at
   where installation_id = installation_row.installation_id;

  update public.api_keys
     set key_state = 'REVOKED',
         revoked_at = v_revoked_at,
         grace_expires_at = null
   where installation_id = installation_row.installation_id
     and key_state in ('ACTIVE', 'GRACE');

  get diagnostics v_revoked_keys = row_count;

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

