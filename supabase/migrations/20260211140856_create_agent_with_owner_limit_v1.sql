-- Atomic helper for owner-claim agent creation:
-- lock owner row, enforce owner agent limit, then insert.
create or replace function public.create_agent_with_owner_limit_v1(
  p_owner_id uuid,
  p_name text default null,
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb,
  p_wallet_address text default null,
  p_trust_score int default 10,
  p_trust_flags jsonb default '[]'::jsonb,
  p_trust_formula_version int default 1,
  p_owner_agent_limit int default 1
)
returns public.agents
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_limit int := greatest(1, coalesce(p_owner_agent_limit, 1));
  v_existing_count int := 0;
  v_now timestamptz := now();
  v_agent public.agents%rowtype;
begin
  if p_owner_id is null then
    raise exception 'VALIDATION_ERROR:OWNER_ID';
  end if;

  perform 1
  from public.owners o
  where o.owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'INVALID_REFERENCE:OWNER';
  end if;

  select count(*)::int
    into v_existing_count
  from public.agents a
  where a.owner_id = p_owner_id;

  if v_existing_count >= v_limit then
    return null;
  end if;

  insert into public.agents (
    name,
    status,
    owner_id,
    metadata,
    wallet_address,
    trust_score,
    trust_flags,
    trust_formula_version,
    trust_updated_at,
    updated_at
  )
  values (
    nullif(btrim(coalesce(p_name, '')), ''),
    coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'active'),
    p_owner_id,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(btrim(coalesce(p_wallet_address, '')), ''),
    coalesce(p_trust_score, 10),
    case
      when jsonb_typeof(coalesce(p_trust_flags, '[]'::jsonb)) = 'array' then coalesce(p_trust_flags, '[]'::jsonb)
      else '[]'::jsonb
    end,
    coalesce(p_trust_formula_version, 1),
    v_now,
    v_now
  )
  returning * into v_agent;

  return v_agent;
end;
$$;
